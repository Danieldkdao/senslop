import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { AgentStore } from "../../agents/lib/agent-store";

const state = vi.hoisted(() => ({ store: null as unknown as LocalStore }));
vi.mock("../../../features/workspace/lib/server-workspace", () => ({
  getWorkspace: () => ({ store: state.store, root: async () => "/repo" }),
  protectLocalRoute: () => true,
  readLocalBody: (request: Request) => request.json(),
}));
import {
  PATCH as patchAi,
  PUT as putAi,
  GET as getAi,
} from "../../../app/api/agents/settings/route";
import { defaultConnectionCapacity } from "../../ai-capacity/lib/capacity";
import {
  GET as getReview,
  PATCH as patchReview,
} from "../../../app/api/review-preferences/route";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "senslop-settings-"));
  state.store = new LocalStore(join(directory, "reviews.sqlite"));
});
afterEach(async () => {
  state.store.close();
  await rm(directory, { recursive: true, force: true });
});
const request = (body: object) =>
  new Request("http://localhost/api/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

test("capacity status covers active runs and both save methods reject changes until completion", async () => {
  const agents = new AgentStore(state.store, "/repo");
  const review = state.store.saveReview(
    "/repo",
    {
      id: crypto.randomUUID(),
      protocolVersion: 1,
      source: {
        kind: "working-tree",
        base: "a".repeat(40),
        head: null,
        firstParent: false,
      },
      files: [],
      excluded: [],
    },
    null,
    true,
  );
  const job = agents.createJob(review.id, "review");
  const statusRequest = new Request(
    "http://localhost/api/agents/settings?capacityStatus=1",
  );
  expect(await (await getAi(statusRequest)).json()).toEqual({ locked: true });
  const profile = defaultConnectionCapacity({
    provider: "lm-studio",
    contextWindow: null,
  });
  for (const write of [patchAi, putAi]) {
    const response = await write(
      request({ ...agents.settings(), capacity: { test: profile } }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      message: expect.stringMatching(/grouping or review/),
    });
  }
  agents.updateJob(job.id, { status: "canceled" });
  expect(await (await getAi(statusRequest)).json()).toEqual({ locked: false });
  expect((await patchAi(request({ capacity: { test: profile } }))).status).toBe(
    200,
  );
});

test("CLI AI patches merge nested model roles without resetting other settings", async () => {
  const agents = new AgentStore(state.store, "/repo");
  const model = {
    connectionId: crypto.randomUUID(),
    modelId: "fixture",
    name: "Fixture",
  };
  agents.saveSettings({
    ...agents.settings(),
    roles: { ...agents.settings().roles, review: model },
  });
  const response = await patchAi(
    request({ groupingMode: "always", roles: { grouping: model } }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    groupingMode: "always",
    roles: { grouping: model, review: model },
    prompt: agents.settings().prompt,
  });
  expect((await patchAi(request({ unknown: true }))).status).toBe(400);
});

test("review preference patches persist and reject unknown keys", async () => {
  expect((await patchReview(request({ autoAdvance: true }))).status).toBe(200);
  expect(await (await getReview(request({}))).json()).toEqual({
    autoAdvance: true,
  });
  expect((await patchReview(request({ unrelated: false }))).status).toBe(400);
});

test.each(["always", "ask"] as const)(
  "unrelated AI patches preserve the saved %s grouping mode",
  async (groupingMode) => {
    const agents = new AgentStore(state.store, "/repo");
    agents.saveSettings({ ...agents.settings(), groupingMode });
    const model = {
      connectionId: crypto.randomUUID(),
      modelId: "review-model",
      name: "Review model",
    };
    for (const patch of [
      { prompt: "Keep prerequisites first" },
      { roles: { review: model } },
    ]) {
      const response = await patchAi(request(patch));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ groupingMode });
      expect(agents.settings().groupingMode).toBe(groupingMode);
    }
    expect(agents.settings()).toMatchObject({
      groupingMode,
      prompt: "Keep prerequisites first",
      roles: { review: model },
    });
  },
);
