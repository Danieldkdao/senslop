import type { UIMessage } from "ai";
import { randomUUID } from "node:crypto";
import type { LocalStore } from "@senslop/review-core/storage";
import {
  aiSettingsSchema,
  aiSettingsPatchSchema,
  conversationSchema,
  jobSchema,
  type AiSettingsSchema,
  type JobKind,
  type JobSchema,
  type ModelSelectionSchema,
  type MessageStatus,
} from "../schemas";
import { defaultAiSettings } from "../constants";
import { matchesJobSnapshot } from "./job-snapshots";

export class AgentStore {
  constructor(
    readonly local: LocalStore,
    readonly repository: string,
  ) {}

  settings = () => {
    const existingSettings = this.local.database
      .prepare("SELECT value FROM preferences WHERE name = 'ai_settings'")
      .get();
    return aiSettingsSchema.parse(
      existingSettings
        ? JSON.parse(String(existingSettings.value))
        : defaultAiSettings,
    );
  };

  saveSettings = (input: AiSettingsSchema) => {
    const settings = aiSettingsSchema.parse(input);
    this.local.database
      .prepare(
        "INSERT INTO preferences VALUES ('ai_settings', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(settings));
    return settings;
  };

  patchSettings = (input: unknown) =>
    this.local.transaction(() => {
      const patch = aiSettingsPatchSchema.parse(input);
      const existingSettings = this.settings();
      return this.saveSettings({
        ...existingSettings,
        ...patch,
        roles: { ...existingSettings.roles, ...patch.roles },
      });
    });

  snapshot = (id: string) => {
    const existingReview = this.local.getReview(this.repository, id);
    if (!existingReview)
      throw new Error("Snapshot not found in this repository.");
    return existingReview;
  };

  jobs = (snapshotId: string) => {
    this.snapshot(snapshotId);
    return (["grouping", "review"] as const).flatMap((kind) =>
      this.local.database
        .prepare(
          "SELECT body FROM ai_jobs WHERE snapshot_id = ? AND json_extract(body, '$.kind') = ? ORDER BY rowid DESC LIMIT 100",
        )
        .all(snapshotId, kind)
        .map((row) => jobSchema.parse(JSON.parse(String(row.body)))),
    );
  };

  job = (id: string) => {
    const existingJob = this.local.database
      .prepare(
        "SELECT j.body FROM ai_jobs j JOIN reviews r ON r.id = j.snapshot_id WHERE j.id = ? AND r.repository = ?",
      )
      .get(id, this.repository);
    return existingJob
      ? jobSchema.parse(JSON.parse(String(existingJob.body)))
      : null;
  };

  jobHistory = (snapshotId: string, offset = 0, limit = 50, search = "") => {
    this.snapshot(snapshotId);
    const existingJobs = this.local.database
      .prepare(
        "SELECT body FROM ai_jobs WHERE snapshot_id = ? AND instr(lower(body), lower(?)) > 0 ORDER BY rowid DESC LIMIT ? OFFSET ?",
      )
      .all(snapshotId, search.trim().slice(0, 200), limit + 1, offset);
    return {
      items: existingJobs
        .slice(0, limit)
        .map((row) => jobSchema.parse(JSON.parse(String(row.body)))),
      next: existingJobs.length > limit ? offset + limit : null,
    };
  };

  renameReview = (id: string, title: string) =>
    this.local.transaction(() => {
      const existingJob = this.job(id);
      if (!existingJob || existingJob.kind !== "review")
        throw new Error("AI review not found.");
      const updatedJob = jobSchema.parse({
        ...existingJob,
        title,
        updatedAt: new Date().toISOString(),
      });
      this.local.database
        .prepare("UPDATE ai_jobs SET body = ? WHERE id = ?")
        .run(JSON.stringify(updatedJob), id);
      return updatedJob;
    });

  deleteReview = (id: string) =>
    this.local.transaction(() => {
      const existingJob = this.job(id);
      if (!existingJob || existingJob.kind !== "review")
        throw new Error("AI review not found.");
      if (existingJob.status === "queued" || existingJob.status === "running")
        throw new Error("Stop this review before deleting it.");
      this.local.database.prepare("DELETE FROM ai_jobs WHERE id = ?").run(id);
    });

  pendingJobs = () =>
    this.local.database
      .prepare(
        "SELECT j.body FROM ai_jobs j JOIN reviews r ON r.id = j.snapshot_id WHERE r.repository = ? AND json_extract(j.body, '$.status') IN ('queued', 'running')",
      )
      .all(this.repository)
      .map((row) => jobSchema.parse(JSON.parse(String(row.body))));

  recoverJobs = (startedAt: string) =>
    this.local.transaction(() => {
      const snapshots = new Set<string>();
      for (const job of this.pendingJobs()) {
        if (job.updatedAt >= startedAt) continue;
        this.writeJob(job.id, {
          status: "queued",
          dispatched: false,
          runId: null,
          progress: "Resuming after workspace restart",
          error: null,
        });
        snapshots.add(job.snapshotId);
      }
      return [...snapshots];
    });

  createJob = (snapshotId: string, kind: JobKind) =>
    this.local.transaction(() => {
      const snapshot = this.snapshot(snapshotId);
      if (kind === "grouping" && snapshot.groupingEnabled === false)
        throw new Error(
          "Grouping and summarization are disabled for this review.",
        );
      const jobs = this.jobs(snapshotId).filter((job) => job.kind === kind);
      const active = jobs.find(
        (job) =>
          matchesJobSnapshot(job, snapshot) &&
          (job.status === "queued" || job.status === "running"),
      );
      if (active) return active;
      const now = new Date().toISOString();
      const job = jobSchema.parse({
        id: randomUUID(),
        snapshotId,
        hash: snapshot.hash,
        snapshotRound: snapshot.round,
        kind,
        generation: (jobs[0]?.generation ?? 0) + 1,
        settings: this.settings(),
        status: "queued",
        progress: "Waiting for local worker",
        error: null,
        createdAt: now,
        updatedAt: now,
        runId: null,
        dispatched: false,
        result: null,
      });
      this.local.database
        .prepare("INSERT INTO ai_jobs VALUES (?, ?, ?)")
        .run(job.id, snapshotId, JSON.stringify(job));
      return job;
    });

  private writeJob = (
    id: string,
    patch: Partial<
      Pick<
        JobSchema,
        "status" | "progress" | "error" | "runId" | "dispatched" | "result"
      >
    >,
  ) => {
    const existingJob = this.job(id);
    if (
      !existingJob ||
      existingJob.status === "canceled" ||
      existingJob.status === "completed"
    )
      return existingJob;
    const updatedJob = jobSchema.parse({
      ...existingJob,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    this.local.database
      .prepare("UPDATE ai_jobs SET body = ? WHERE id = ?")
      .run(JSON.stringify(updatedJob), id);
    return updatedJob;
  };

  updateJob = (id: string, patch: Parameters<AgentStore["writeJob"]>[1]) =>
    this.local.transaction(() => this.writeJob(id, patch));

  readCheckpoint = (id: string, key: string): unknown => {
    const existingJob = this.job(id);
    if (!existingJob) return null;
    const existingCheckpoint = this.local.database
      .prepare(
        "SELECT c.body FROM ai_batch_checkpoints c JOIN ai_jobs j ON j.id = c.job_id WHERE j.snapshot_id = ? AND json_extract(j.body, '$.kind') = ? AND json_extract(j.body, '$.hash') = ? AND COALESCE(json_extract(j.body, '$.snapshotRound'), ?) = ? AND c.checkpoint_key = ? ORDER BY (j.id = ?) DESC, j.rowid DESC LIMIT 1",
      )
      .get(
        existingJob.snapshotId,
        existingJob.kind,
        existingJob.hash,
        existingJob.snapshotRound ?? 1,
        existingJob.snapshotRound ?? 1,
        key,
        id,
      );
    if (!existingCheckpoint) return null;
    try {
      return JSON.parse(String(existingCheckpoint.body));
    } catch {
      return null;
    }
  };

  writeCheckpoint = (id: string, key: string, result: unknown) =>
    this.local.transaction(() => {
      const existingJob = this.job(id);
      if (!existingJob || !["queued", "running"].includes(existingJob.status))
        return false;
      this.local.database
        .prepare(
          "INSERT INTO ai_batch_checkpoints VALUES (?, ?, ?) ON CONFLICT (job_id, checkpoint_key) DO UPDATE SET body = excluded.body",
        )
        .run(id, key, JSON.stringify(result));
      return true;
    });

  history = (
    snapshotId: string,
    kind: "reviews" | "conversations",
    offset: number,
    search = "",
  ) => {
    this.snapshot(snapshotId);
    const reviews = kind === "reviews";
    const rows = this.local.database
      .prepare(
        reviews
          ? "SELECT body FROM ai_jobs WHERE snapshot_id = ? AND json_extract(body, '$.kind') = 'review' AND instr(lower(body), lower(?)) > 0 ORDER BY rowid DESC LIMIT 51 OFFSET ?"
          : "SELECT body FROM ai_conversations WHERE snapshot_id = ? AND instr(lower(json_extract(body, '$.title')), lower(?)) > 0 ORDER BY json_extract(body, '$.updatedAt') DESC, rowid DESC LIMIT 51 OFFSET ?",
      )
      .all(snapshotId, search.trim().slice(0, 200), offset);
    const items = rows
      .slice(0, 50)
      .map((row) =>
        reviews
          ? jobSchema.parse(JSON.parse(String(row.body)))
          : conversationSchema
              .omit({ messages: true })
              .parse(JSON.parse(String(row.body))),
      );
    return { items, next: rows.length > 50 ? offset + 50 : null };
  };

  recoverForeground = (startedAt: string) => {
    const rows = this.local.database
      .prepare(
        "SELECT c.body FROM ai_conversations c JOIN reviews r ON r.id = c.snapshot_id WHERE r.repository = ? AND json_extract(c.body, '$.updatedAt') < ?",
      )
      .all(this.repository, startedAt);
    for (const row of rows) {
      const conversation = conversationSchema.parse(
        JSON.parse(String(row.body)),
      );
      if (
        conversation.messages.some((message) => message.status === "streaming")
      )
        this.changeConversation(conversation.id, (saved) => {
          for (const message of saved.messages)
            if (message.status === "streaming") message.status = "interrupted";
        });
    }
  };

  publish = (id: string, result: unknown) =>
    this.local.transaction(() => {
      const job = this.job(id);
      if (!job || job.status === "canceled" || job.status === "completed")
        return false;
      const latest = this.jobs(job.snapshotId).find(
        (item) => item.kind === job.kind,
      );
      if (
        latest?.id !== id ||
        !matchesJobSnapshot(job, this.snapshot(job.snapshotId))
      )
        return false;
      this.writeJob(id, {
        status: "completed",
        progress: "Complete",
        error: null,
        result: jobSchema.shape.result.parse(result),
      });
      return true;
    });

  conversations = (snapshotId: string) => {
    this.snapshot(snapshotId);
    return this.local.database
      .prepare(
        "SELECT body FROM ai_conversations WHERE snapshot_id = ? ORDER BY json_extract(body, '$.updatedAt') DESC LIMIT 100",
      )
      .all(snapshotId)
      .map((row) => {
        const conversation = conversationSchema
          .omit({ messages: true })
          .parse(JSON.parse(String(row.body)));
        return conversation;
      });
  };

  conversation = (id: string) => {
    const existingConversation = this.local.database
      .prepare(
        "SELECT c.body FROM ai_conversations c JOIN reviews r ON r.id = c.snapshot_id WHERE c.id = ? AND r.repository = ?",
      )
      .get(id, this.repository);
    return existingConversation
      ? conversationSchema.parse(JSON.parse(String(existingConversation.body)))
      : null;
  };

  createConversation = (snapshotId: string) => {
    this.snapshot(snapshotId);
    const conversation = conversationSchema.parse({
      id: randomUUID(),
      snapshotId,
      title: "New conversation",
      updatedAt: new Date().toISOString(),
      model: null,
      messages: [],
    });
    this.local.database
      .prepare("INSERT INTO ai_conversations VALUES (?, ?, ?)")
      .run(conversation.id, snapshotId, JSON.stringify(conversation));
    return conversation;
  };

  private changeConversation = (
    id: string,
    change: (conversation: ReturnType<typeof conversationSchema.parse>) => void,
  ) =>
    this.local.transaction(() => {
      const existingConversation = this.conversation(id);
      if (!existingConversation) throw new Error("Conversation not found.");
      change(existingConversation);
      existingConversation.updatedAt = new Date().toISOString();
      const updatedConversation =
        conversationSchema.parse(existingConversation);
      this.local.database
        .prepare("UPDATE ai_conversations SET body = ? WHERE id = ?")
        .run(JSON.stringify(updatedConversation), id);
      return updatedConversation;
    });

  renameConversation = (id: string, title: string) =>
    this.changeConversation(id, (conversation) => {
      conversation.title = title;
    });

  deleteConversation = (id: string) => {
    if (!this.conversation(id)) throw new Error("Conversation not found.");
    this.local.database
      .prepare("DELETE FROM ai_conversations WHERE id = ?")
      .run(id);
  };

  beginTurn = (
    id: string,
    content: string,
    model: ModelSelectionSchema,
    messageId: string = randomUUID(),
  ) =>
    this.changeConversation(id, (conversation) => {
      const last = conversation.messages.at(-1);
      if (last?.status === "streaming")
        throw new Error("A response is already running.");
      const previousUser = conversation.messages.at(-2);
      if (
        previousUser?.role === "user" &&
        (previousUser.id ?? `${id}:${conversation.messages.length - 2}`) ===
          messageId &&
        previousUser.content === content
      )
        conversation.messages.splice(-2);
      else if (
        conversation.messages.some((message) => message.id === messageId)
      )
        throw new Error("This message already exists. Start a new turn.");
      if (conversation.messages.length >= 98)
        throw new Error("Start a new conversation to continue.");
      conversation.model = model;
      if (!conversation.messages.length)
        conversation.title = content.slice(0, 80);
      const updatedAt = new Date().toISOString();
      conversation.messages.push(
        {
          id: messageId,
          parts: [{ type: "text", text: content }],
          role: "user",
          content,
          status: "complete",
          model,
          updatedAt,
          createdAt: updatedAt,
          toolTrace: [],
        },
        {
          id: randomUUID(),
          parts: [],
          role: "assistant",
          content: "",
          status: "streaming",
          model,
          updatedAt,
          createdAt: updatedAt,
          toolTrace: [],
        },
      );
    });

  finishTurn = (
    id: string,
    content: string,
    status: MessageStatus,
    message?: UIMessage,
  ) => {
    if (!this.conversation(id)) return null;
    return this.changeConversation(id, (conversation) => {
      const last = conversation.messages.at(-1);
      if (
        last?.role === "assistant" &&
        last.status === "streaming" &&
        (!message || last.id === message.id)
      ) {
        last.content = content;
        last.status = status;
        if (message)
          last.parts =
            Buffer.byteLength(JSON.stringify(message.parts)) <= 200000
              ? message.parts
              : [{ type: "text", text: content }];
        const timing = conversationSchema.shape.messages.element
          .pick({ thinkingDurationMs: true })
          .safeParse(message?.metadata);
        if (timing.success)
          last.thinkingDurationMs = timing.data.thinkingDurationMs;
        last.updatedAt = new Date().toISOString();
      }
    });
  };
}
