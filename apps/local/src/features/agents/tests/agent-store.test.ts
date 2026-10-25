import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { saveProjectPolicy } from "@senslop/review-core/policy";
import { projectPolicySchema } from "@senslop/contracts";
import { AgentStore } from "../lib/agent-store";
import { defaultConnectionCapacity } from "../../ai-capacity/lib/capacity";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-agents-"));
  directories.push(directory);
  const databasePath = join(directory, "reviews.sqlite");
  const local = new LocalStore(databasePath);
  const review = local.saveReview(
    "/repo",
    {
      id: randomUUID(),
      protocolVersion: 1,
      source: {
        kind: "working-tree",
        base: "a".repeat(40),
        head: null,
        firstParent: false,
      },
      excluded: [],
      files: [
        {
          path: "file.ts",
          oldPath: null,
          status: "A",
          before: null,
          after: "one\n",
          beforeHash: null,
          afterHash: "a".repeat(64),
          binary: false,
          added: 1,
          deleted: 0,
          diff: "patch",
        },
      ],
    },
    null,
    true,
  );
  return {
    local,
    review,
    agents: new AgentStore(local, "/repo"),
    databasePath,
  };
};

test("capacity settings lock across repositories and remain frozen in saved runs", async () => {
  const { local, review, agents, databasePath } = await fixture();
  try {
    const settings = agents.settings();
    settings.capacity = {
      test: {
        concurrency: 2,
        requestsPerMinute: 20,
        inputTokensPerMinute: 100000,
        outputTokensPerMinute: null,
        contextTokens: 16384,
        outputTokens: 2048,
        groupingInputTokens: 8000,
        reviewInputTokens: 8000,
      },
    };
    agents.saveSettings(settings);
    const job = agents.createJob(review.id, "grouping");
    const other = new AgentStore(local, "/other");
    expect(other.capacityLocked()).toBe(true);
    expect(() =>
      other.patchSettings({
        capacity: { test: { ...settings.capacity.test, concurrency: 4 } },
      }),
    ).toThrow(/grouping or review/);
    other.patchSettings({ prompt: "Unrelated preference" });
    expect(agents.job(job.id)?.settings.capacity.test?.concurrency).toBe(2);
    agents.updateJob(job.id, { status: "completed" });
    other.patchSettings({
      capacity: { test: { ...settings.capacity.test, concurrency: 4 } },
    });
    expect(
      agents.createJob(review.id, "review").settings.capacity.test?.concurrency,
    ).toBe(4);
    const reopened = new LocalStore(databasePath);
    try {
      expect(
        new AgentStore(reopened, "/repo").job(job.id)?.settings.capacity.test
          ?.concurrency,
      ).toBe(2);
    } finally {
      reopened.close();
    }
  } finally {
    local.close();
  }
});

test("an unrelated settings patch preserves capacity and legacy preferences get defaults", async () => {
  const { local, agents } = await fixture();
  try {
    expect(agents.settings().capacity).toEqual({});
    agents.patchSettings({ capacity: {} });
    agents.patchSettings({ prompt: "Changed instructions" });
    expect(agents.settings().capacity).toEqual({});
  } finally {
    local.close();
  }
});

test("patching one connection's capacity keeps other connection budgets", async () => {
  const { local, agents } = await fixture();
  try {
    const profile = defaultConnectionCapacity({
      provider: "lm-studio",
      contextWindow: null,
    });
    agents.patchSettings({ capacity: { first: profile, second: profile } });
    agents.patchSettings({
      capacity: { first: { ...profile, concurrency: 2 } },
    });
    expect(agents.settings().capacity.second).toEqual(profile);
    expect(agents.settings().capacity.first?.concurrency).toBe(2);
  } finally {
    local.close();
  }
});

test("queued jobs capture default connection budgets before configuration changes", async () => {
  const { local, review, agents } = await fixture();
  try {
    const connection = {
      id: randomUUID(),
      provider: "lm-studio",
      name: "Local",
      model: "",
      baseURL: "http://localhost:1234/v1",
      contextWindow: 32768,
      credentialRef: null,
      revision: 0,
    };
    local.database
      .prepare("INSERT INTO connections VALUES (?, ?)")
      .run(connection.id, JSON.stringify(connection));
    const job = agents.createJob(review.id, "review");
    local.database
      .prepare("UPDATE connections SET body = ? WHERE id = ?")
      .run(
        JSON.stringify({ ...connection, contextWindow: 64000 }),
        connection.id,
      );
    expect(
      agents.job(job.id)?.settings.capacity[connection.id]?.contextTokens,
    ).toBe(32768);
    expect(agents.settings().capacity).toEqual({});
  } finally {
    local.close();
  }
});
test("validated batch checkpoints survive restart and stay scoped to active repository jobs", async () => {
  const { local, review, agents, databasePath } = await fixture();
  const job = agents.createJob(review.id, "grouping");
  const result = {
    groups: [
      {
        title: "Flow",
        rationale: "Change",
        files: [{ path: "file.ts", summary: "Change", related: [] }],
      },
    ],
  };
  expect(agents.writeCheckpoint(job.id, "batch", result)).toBe(true);
  local.close();
  const reopened = new LocalStore(databasePath);
  try {
    const restored = new AgentStore(reopened, "/repo");
    expect(restored.readCheckpoint(job.id, "batch")).toEqual(result);
    expect(
      new AgentStore(reopened, "/other").readCheckpoint(job.id, "batch"),
    ).toBeNull();
    restored.updateJob(job.id, { status: "canceled" });
    expect(restored.writeCheckpoint(job.id, "late", result)).toBe(false);
    reopened.deleteReview("/repo", review.id);
    expect(restored.readCheckpoint(job.id, "batch")).toBeNull();
  } finally {
    reopened.close();
  }
});
test("settings are computer-wide and jobs persist without resetting human feedback", async () => {
  const { local, review, agents, databasePath } = await fixture();
  const settings = agents.settings();
  settings.prompt = "Order prerequisites first";
  agents.saveSettings(settings);
  const job = agents.createJob(review.id, "grouping");
  expect(agents.createJob(review.id, "grouping").id).toBe(job.id);
  local.changeReview("/repo", review.id, {
    action: "complete",
    path: "file.ts",
    complete: true,
  });
  local.close();
  const reopened = new LocalStore(databasePath);
  try {
    const restored = new AgentStore(reopened, "/repo");
    expect(restored.settings().prompt).toBe(settings.prompt);
    expect(restored.job(job.id)?.settings.prompt).toBe(settings.prompt);
    expect(reopened.getReview("/repo", review.id)?.completedPaths).toEqual([
      "file.ts",
    ]);
    expect(new AgentStore(reopened, "/other").job(job.id)).toBeNull();
  } finally {
    reopened.close();
  }
});

test("an intentional retry can reuse compatible checkpoint keys from the same snapshot", async () => {
  const { local, review, agents } = await fixture();
  try {
    const previousJob = agents.createJob(review.id, "grouping");
    agents.writeCheckpoint(previousJob.id, "same-input", { groups: [] });
    agents.updateJob(previousJob.id, { status: "failed" });
    const nextJob = agents.createJob(review.id, "grouping", {
      retryOf: previousJob.id,
    });
    expect(agents.readCheckpoint(nextJob.id, "same-input")).toEqual({
      groups: [],
    });
    expect(
      agents.readCheckpoint(nextJob.id, "changed-input-or-model"),
    ).toBeNull();
  } finally {
    local.close();
  }
});
test("late jobs cannot overwrite new generations or deleted snapshots", async () => {
  const { local, review, agents } = await fixture();
  try {
    const first = agents.createJob(review.id, "grouping");
    agents.updateJob(first.id, { status: "failed", error: "retry" });
    const second = agents.createJob(review.id, "grouping");
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(agents.publish(first.id, { groups: [] })).toBe(false);
    local.deleteReview("/repo", review.id);
    expect(agents.job(second.id)).toBeNull();
    expect(agents.publish(second.id, { groups: [] })).toBe(false);
  } finally {
    local.close();
  }
});
test("conversations keep model provenance, interrupted messages, rename and deletion", async () => {
  const { local, review, agents } = await fixture();
  try {
    const conversation = agents.createConversation(review.id);
    const model = {
      connectionId: randomUUID(),
      modelId: "model",
      name: "Model",
    };
    agents.beginTurn(conversation.id, "hello", model);
    expect(() => agents.beginTurn(conversation.id, "duplicate", model)).toThrow(
      /running/,
    );
    agents.finishTurn(conversation.id, "partial", "interrupted");
    agents.renameConversation(conversation.id, "Changed behavior");
    const saved = agents.conversation(conversation.id)!;
    expect(saved.title).toBe("Changed behavior");
    expect(saved.messages[1]).toMatchObject({
      content: "partial",
      status: "interrupted",
      model,
    });
    agents.deleteConversation(conversation.id);
    expect(agents.conversation(conversation.id)).toBeNull();
  } finally {
    local.close();
  }
});

test("histories paginate without losing older runs and startup interrupts stale foreground turns", async () => {
  const { local, review, agents } = await fixture();
  try {
    for (let index = 0; index < 53; index++) {
      agents.createConversation(review.id);
      const job = agents.createJob(review.id, "review");
      agents.updateJob(job.id, { status: "failed" });
    }
    const first = agents.history(review.id, "conversations", 0);
    const second = agents.history(review.id, "conversations", 50);
    expect(first.items).toHaveLength(50);
    expect(first.next).toBe(50);
    expect(second.items).toHaveLength(3);
    expect(second.next).toBeNull();
    expect(agents.history(review.id, "reviews", 50).items).toHaveLength(3);
    const conversation = agents.createConversation(review.id);
    agents.beginTurn(conversation.id, "question", {
      connectionId: randomUUID(),
      modelId: "fixture",
      name: "Fixture",
    });
    agents.recoverForeground(new Date(Date.now() + 1000).toISOString());
    expect(agents.conversation(conversation.id)?.messages.at(-1)?.status).toBe(
      "interrupted",
    );
  } finally {
    local.close();
  }
});

test("startup recovers unfinished repository jobs once and keeps completed analysis checkpoints", async () => {
  const { local, review, agents } = await fixture();
  try {
    const completed = agents.createJob(review.id, "grouping");
    agents.publish(completed.id, {
      groups: [
        {
          title: "Flow",
          rationale: "why",
          files: [{ path: "file.ts", summary: "change", related: [] }],
        },
      ],
    });
    const pending = agents.createJob(review.id, "review");
    const result = {
      findings: [],
      limitations: [],
      fixAllPrompt: "No issues.",
    };
    agents.updateJob(pending.id, {
      status: "running",
      dispatched: true,
      result,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const boot = new Date().toISOString();
    expect(new AgentStore(local, "/other").recoverJobs(boot)).toEqual([]);
    expect(agents.recoverJobs(boot)).toEqual([review.id]);
    expect(agents.job(pending.id)).toMatchObject({
      status: "queued",
      dispatched: false,
      result,
    });
    expect(agents.job(completed.id)?.status).toBe("completed");
    expect(agents.recoverJobs(boot)).toEqual([]);
    agents.updateJob(pending.id, { status: "canceled" });
    expect(
      agents.recoverJobs(new Date(Date.now() + 1000).toISOString()),
    ).toEqual([]);
  } finally {
    local.close();
  }
});

test("SDK message identities and tool parts persist while retry replaces an interrupted turn", async () => {
  const { local, review, agents } = await fixture();
  try {
    const conversation = agents.createConversation(review.id);
    const model = {
      connectionId: randomUUID(),
      modelId: "fixture",
      name: "Fixture",
    };
    const turn = agents.beginTurn(
      conversation.id,
      "question",
      model,
      "user-message",
    );
    const message = {
      id: turn.messages.at(-1)!.id!,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "partial" }],
    };
    agents.finishTurn(conversation.id, "partial", "interrupted", message);
    const retry = agents.beginTurn(
      conversation.id,
      "question",
      model,
      "user-message",
    );
    expect(retry.messages).toHaveLength(2);
    expect(retry.messages[0]?.id).toBe("user-message");
    const response = {
      id: retry.messages.at(-1)!.id!,
      role: "assistant" as const,
      metadata: { thinkingDurationMs: 64000 },
      parts: [
        {
          type: "tool-readSource" as const,
          toolCallId: "read",
          state: "output-available" as const,
          input: { path: "a.ts" },
          output: "source",
        },
        { type: "text" as const, text: "answer" },
      ],
    };
    agents.finishTurn(conversation.id, "answer", "complete", response);
    expect(agents.conversation(conversation.id)?.messages.at(-1)).toMatchObject(
      {
        id: response.id,
        parts: response.parts,
        status: "complete",
        createdAt: expect.any(String),
        thinkingDurationMs: 64000,
      },
    );
    agents.finishTurn(conversation.id, "late partial", "interrupted", message);
    expect(agents.conversation(conversation.id)?.messages.at(-1)?.content).toBe(
      "answer",
    );
  } finally {
    local.close();
  }
});

test("AI review titles and deletion are durable and scoped without deleting snapshot, grouping, or conversations", async () => {
  const { local, review, agents, databasePath } = await fixture();
  try {
    const grouping = agents.createJob(review.id, "grouping");
    const job = agents.createJob(review.id, "review");
    const conversation = agents.createConversation(review.id);
    expect(() => agents.deleteReview(job.id)).toThrow(/Stop/);
    expect(() => agents.renameReview(grouping.id, "Group")).toThrow(/review/i);
    agents.updateJob(job.id, {
      status: "failed",
      error: "Fixture",
      progress: "Failed",
    });
    agents.renameReview(job.id, "Named review");
    const other = new AgentStore(local, "/other");
    expect(() => other.renameReview(job.id, "Not owned")).toThrow(/not found/i);
    expect(() => other.deleteReview(job.id)).toThrow(/not found/i);
    expect(agents.job(job.id)?.title).toBe("Named review");
    expect(
      agents.history(review.id, "reviews", 0, "Named review").items,
    ).toHaveLength(1);
    agents.deleteReview(job.id);
    expect(agents.job(job.id)).toBeNull();
    expect(agents.job(grouping.id)).not.toBeNull();
    expect(agents.conversation(conversation.id)).not.toBeNull();
    expect(local.getReview("/repo", review.id)).not.toBeNull();
  } finally {
    local.database.close();
  }
  const reopened = new LocalStore(databasePath);
  try {
    expect(
      new AgentStore(reopened, "/repo").history(review.id, "reviews", 0).items,
    ).toHaveLength(0);
  } finally {
    reopened.database.close();
  }
});

test("another tab cannot replace a streaming answer after three minutes", async () => {
  const { local, review, agents } = await fixture();
  try {
    const conversation = agents.createConversation(review.id);
    const model = {
      connectionId: randomUUID(),
      modelId: "fixture",
      name: "Fixture",
    };
    const turn = agents.beginTurn(conversation.id, "first question", model);
    turn.messages.at(-1)!.updatedAt = new Date(
      Date.now() - 4 * 60 * 1000,
    ).toISOString();
    local.database
      .prepare("UPDATE ai_conversations SET body = ? WHERE id = ?")
      .run(JSON.stringify(turn), conversation.id);
    const otherTab = new AgentStore(local, "/repo");
    expect(() =>
      otherTab.beginTurn(conversation.id, "second question", model),
    ).toThrow(/already running/);
    agents.finishTurn(conversation.id, "first answer", "complete", {
      id: turn.messages.at(-1)!.id!,
      role: "assistant",
      parts: [{ type: "text", text: "first answer" }],
    });
    expect(agents.conversation(conversation.id)?.messages.at(-1)).toMatchObject(
      { content: "first answer", status: "complete" },
    );
    expect(() =>
      otherTab.beginTurn(conversation.id, "second question", model),
    ).not.toThrow();
  } finally {
    local.close();
  }
});

test("terminal grouping failure persists one fallback deadline and preserves the snapshot across restart", async () => {
  const { local, review, agents, databasePath } = await fixture();
  const job = agents.createJob(review.id, "grouping");
  const now = Date.parse("2026-10-17T12:00:00Z");
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  try {
    agents.updateJob(job.id, { retryAt: new Date(now + 30000).toISOString() });
    agents.failJob(job.id, "Provider unavailable");
    expect(agents.job(job.id)).toMatchObject({
      status: "failed",
      error: "Provider unavailable",
      retryAt: null,
      fallbackAt: new Date(now + 15000).toISOString(),
      result: null,
    });
    clock.mockReturnValue(now + 5000);
    agents.failJob(job.id, "Duplicate failure");
    expect(agents.job(job.id)?.fallbackAt).toBe(
      new Date(now + 15000).toISOString(),
    );
    expect(agents.snapshot(review.id).files).toEqual(review.files);
    local.close();
    const reopened = new LocalStore(databasePath);
    try {
      const restored = new AgentStore(reopened, "/repo");
      expect(restored.job(job.id)?.fallbackAt).toBe(
        new Date(now + 15000).toISOString(),
      );
      const retry = restored.createJob(review.id, "grouping");
      expect(retry).toMatchObject({ retryAt: null, fallbackAt: null });
    } finally {
      reopened.close();
    }
  } finally {
    clock.mockRestore();
    if (local.database.isOpen) local.close();
  }
});

test("failure callbacks never schedule fallback for canceled, completed, or correctness jobs", async () => {
  const { local, review, agents } = await fixture();
  try {
    const canceled = agents.createJob(review.id, "grouping");
    agents.updateJob(canceled.id, { status: "canceled" });
    agents.failJob(canceled.id, "late");
    expect(agents.job(canceled.id)).toMatchObject({
      status: "canceled",
      fallbackAt: null,
    });
    const completed = agents.createJob(review.id, "grouping");
    agents.publish(completed.id, {
      groups: [
        {
          title: "Changes",
          rationale: "All files",
          files: [{ path: "file.ts", summary: "Change", related: [] }],
        },
      ],
    });
    agents.failJob(completed.id, "late");
    expect(agents.job(completed.id)).toMatchObject({
      status: "completed",
      fallbackAt: null,
    });
    const correctness = agents.createJob(review.id, "review");
    agents.failJob(correctness.id, "unavailable");
    expect(agents.job(correctness.id)).toMatchObject({
      status: "failed",
      fallbackAt: null,
    });
  } finally {
    local.close();
  }
});

test("history work summaries expose only the latest jobs for the saved revision", async () => {
  const { local, review, agents } = await fixture();
  try {
    const grouping = agents.createJob(review.id, "grouping");
    agents.createJob(review.id, "review");
    const work = agents.reviewWork(review);
    expect(work).toHaveLength(2);
    expect(work.find((job) => job.kind === "grouping")).toMatchObject({
      id: grouping.id,
      status: "queued",
    });
    expect(work[0]).not.toHaveProperty("settings");
    expect(work[0]).not.toHaveProperty("result");
    expect(agents.reviewWork({ ...review, round: review.round + 1 })).toEqual(
      [],
    );
  } finally {
    local.close();
  }
});

test("queued priority changes invalidate dispatch and retries retain source and settings provenance", async () => {
  const { local, review, agents } = await fixture();
  try {
    const first = agents.createJob(review.id, "grouping", {
      hash: review.hash,
      round: review.round,
      priority: "normal",
    });
    agents.updateJob(first.id, { dispatched: true, dispatchKey: "old" });
    const priority = agents.prioritizeJob(first.id, "high");
    expect(priority).toMatchObject({
      priority: "high",
      dispatched: false,
      dispatchKey: null,
      dispatchGeneration: 1,
    });
    agents.failJob(first.id, "Unavailable");
    const retry = agents.createJob(review.id, "grouping", {
      retryOf: first.id,
    });
    expect(retry).toMatchObject({
      retryOf: first.id,
      hash: first.hash,
      snapshotRound: first.snapshotRound,
      settings: first.settings,
      priority: "high",
    });
    expect(retry.id).not.toBe(first.id);
    expect(agents.createJob(review.id, "grouping").id).toBe(retry.id);
    expect(() =>
      agents.createJob(review.id, "review", { hash: "stale", round: 1 }),
    ).toThrow(/changed|reload/i);
    agents.updateJob(retry.id, { status: "running" });
    expect(() => agents.prioritizeJob(retry.id, "normal")).toThrow(/queued/i);
  } finally {
    local.close();
  }
});

test("machine capacity is shared in preferences and locked while any workspace has pending jobs", async () => {
  const { local, review, agents } = await fixture();
  try {
    agents.patchSettings({ machineConcurrency: 2 });
    expect(new AgentStore(local, "/other").settings().machineConcurrency).toBe(
      2,
    );
    agents.createJob(review.id, "grouping");
    expect(() => agents.patchSettings({ machineConcurrency: 8 })).toThrow(
      /capacity|active|running|queued/i,
    );
  } finally {
    local.close();
  }
});

test("an execution from an older dispatch cannot update or publish after recovery", async () => {
  const { local, review, agents } = await fixture();
  try {
    const job = agents.createJob(review.id, "grouping");
    agents.updateJob(job.id, { dispatchKey: "old", status: "running" });
    const previousExecution = new AgentStore(local, "/repo", {
      id: job.id,
      key: "old",
    });
    agents.recoverJobs(new Date(Date.now() + 1000).toISOString());
    previousExecution.updateJob(job.id, { status: "running", error: "stale" });
    expect(previousExecution.publish(job.id, { groups: [] })).toBe(false);
    expect(agents.job(job.id)).toMatchObject({
      status: "queued",
      dispatchKey: null,
      error: null,
    });
  } finally {
    local.close();
  }
});

test("intentional re-analysis does not inherit a completed run's cached batches", async () => {
  const { local, review, agents } = await fixture();
  try {
    const previous = agents.createJob(review.id, "grouping");
    agents.writeCheckpoint(previous.id, "batch", { cached: true });
    agents.publish(previous.id, {
      groups: [
        {
          title: "Flow",
          rationale: "why",
          files: [{ path: "file.ts", summary: "change", related: [] }],
        },
      ],
    });
    const next = agents.createJob(review.id, "grouping");
    expect(next.id).not.toBe(previous.id);
    expect(next.retryOf).toBeNull();
    expect(agents.readCheckpoint(next.id, "batch")).toBeNull();
  } finally {
    local.close();
  }
});

test("source policy changes preserve conversation history but require a new conversation for further inference", async () => {
  const { local, review, agents } = await fixture();
  try {
    const conversation = agents.createConversation(review.id);
    saveProjectPolicy(
      local,
      "/repo",
      projectPolicySchema.parse({ exclude: ["private/**"] }),
    );
    expect(() =>
      agents.beginTurn(conversation.id, "continue", {
        connectionId: randomUUID(),
        modelId: "fixture",
        name: "Fixture",
      }),
    ).toThrow(/policy/i);
    expect(agents.conversation(conversation.id)).not.toBeNull();
  } finally {
    local.close();
  }
});
