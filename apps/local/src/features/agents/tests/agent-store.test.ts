import { afterEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { AgentStore } from "../lib/agent-store";

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
    const nextJob = agents.createJob(review.id, "grouping");
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
