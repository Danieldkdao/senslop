import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { AgentStore } from "../../../features/agents/lib/agent-store";

vi.mock("../../../features/workspace/lib/server-workspace", () => ({
  getWorkspace: vi.fn(),
}));
vi.mock("../../../data/env/server", () => ({
  serverEnv: { SENSLOP_LOCAL_STARTED_AT: "2026-10-24T12:00:00.000Z" },
}));
vi.mock("../client", () => ({
  inngest: { createFunction: vi.fn(), send: vi.fn() },
}));
vi.mock("../jobs", () => ({ executeJob: vi.fn() }));

import { getWorkspace } from "../../../features/workspace/lib/server-workspace";
import { inngest } from "../client";
import { dispatchJobs } from "../functions";

afterEach(() => vi.clearAllMocks());

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-dispatch-race-"));
  const local = new LocalStore(join(directory, "reviews.sqlite"));
  const agents = new AgentStore(local, "/repo");
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
      files: [],
    },
    null,
    true,
  );
  agents.createJob(review.id, "grouping");
  agents.createJob(review.id, "review");
  vi.mocked(getWorkspace).mockReturnValue({
    store: local,
    root: async () => "/repo",
  } as ReturnType<typeof getWorkspace>);
  return {
    agents,
    review,
    close: async () => {
      local.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
};

test.each(["reprioritize", "cancel", "start"])(
  "a paused dispatcher cannot overwrite a later job after %s",
  async (change) => {
    const { agents, review, close } = await fixture();
    try {
      const [, target] = agents.jobs(review.id);
      let release!: () => void;
      let started!: () => void;
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.mocked(inngest.send)
        .mockImplementationOnce(async () => {
          started();
          await paused;
          return { ids: [] };
        })
        .mockResolvedValue({ ids: [] });
      const original = dispatchJobs(review.id);
      await entered;
      try {
        if (change === "reprioritize") {
          agents.prioritizeJob(target!.id, "high");
          await dispatchJobs(review.id);
        } else {
          agents.updateJob(target!.id, {
            status: change === "cancel" ? "canceled" : "running",
          });
        }
      } finally {
        release();
        await original;
      }
      const deliveries = vi
        .mocked(inngest.send)
        .mock.calls.map(([event]) => event)
        .filter(
          (event) => !Array.isArray(event) && event.data?.jobId === target!.id,
        );
      if (change === "reprioritize") {
        expect(inngest.send).toHaveBeenCalledTimes(2);
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]).toMatchObject({
          data: {
            priority: "high",
            dispatchKey: `${target!.id}:2026-10-24T12:00:00.000Z:1`,
          },
        });
        expect(agents.job(target!.id)).toMatchObject({
          dispatchGeneration: 1,
          priority: "high",
          dispatched: true,
          dispatchKey: `${target!.id}:2026-10-24T12:00:00.000Z:1`,
        });
      } else {
        expect(deliveries).toHaveLength(0);
      }
    } finally {
      await close();
    }
  },
);

test("a failed send releases its claim for a later retry", async () => {
  const { agents, review, close } = await fixture();
  try {
    const [target] = agents.jobs(review.id);
    vi.mocked(inngest.send)
      .mockRejectedValueOnce(new Error("Engine offline"))
      .mockResolvedValue({ ids: [] });
    await dispatchJobs(review.id);
    expect(agents.job(target!.id)).toMatchObject({
      dispatched: false,
      error: expect.stringContaining("unavailable"),
    });
    await dispatchJobs(review.id);
    expect(agents.job(target!.id)?.dispatched).toBe(true);
    expect(inngest.send).toHaveBeenCalledTimes(3);
  } finally {
    await close();
  }
});

test("an old send failure cannot release or add an error to a newer priority claim", async () => {
  const { agents, review, close } = await fixture();
  let release!: () => void;
  let notifyEntered!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    notifyEntered = resolve;
  });
  let pending: Promise<void> | undefined;
  try {
    const [target] = agents.jobs(review.id);
    vi.mocked(inngest.send)
      .mockImplementationOnce(async () => {
        notifyEntered();
        await paused;
        throw new Error("Old delivery failed");
      })
      .mockResolvedValue({ ids: [] });
    pending = dispatchJobs(review.id);
    await entered;
    agents.prioritizeJob(target!.id, "high");
    await dispatchJobs(review.id);
    release();
    await pending;
    expect(agents.job(target!.id)).toMatchObject({
      priority: "high",
      dispatchGeneration: 1,
      dispatched: true,
      error: null,
    });
  } finally {
    release();
    await pending;
    await close();
  }
});
