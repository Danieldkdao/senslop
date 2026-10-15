import { expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  fingerprint: "saved",
  rename: vi.fn((id: string, title: string) => ({ id, title })),
  deleteReview: vi.fn(),
  schedule: vi.fn(async () => {}),
  create: vi.fn(() => {
    throw new Error("Grouping disabled");
  }),
}));
vi.mock("../../../features/workspace/lib/server-workspace", () => ({
  protectLocalRoute: () => true,
  readLocalBody: (request: Request) => request.json(),
  getWorkspace: () => ({
    store: {},
    root: async () => "/repo",
    repository: async () => ({ fingerprint: state.fingerprint }),
  }),
}));
vi.mock("../lib/agent-store", () => ({
  AgentStore: class {
    jobs = () => [];
    conversations = () => [];
    settings = () => ({ shared: {} });
    snapshot = () => ({
      groupingEnabled: false,
      fingerprint: "saved",
      rename: vi.fn((id: string, title: string) => ({ id, title })),
      deleteReview: vi.fn(),
      source: { kind: "working-tree" },
    });
    createJob = state.create;
    renameReview = state.rename;
    deleteReview = state.deleteReview;
  },
}));
vi.mock("../../../services/ai/repository-agent", () => ({
  assignedModel: () => ({}),
}));
vi.mock("../../../services/inngest/functions", () => ({
  scheduleGrouping: state.schedule,
  dispatchJobs: vi.fn(async () => {}),
}));
vi.mock("../../../services/inngest/client", () => ({ inngest: {} }));
vi.mock("../../../data/env/server", () => ({ serverEnv: {} }));
import { GET, POST } from "../../../app/api/agents/route";

test("agent state uses the grouping scheduler so disabled grouping does not break chat and reviews", async () => {
  const response = await GET(
    new Request("http://localhost/api/agents?snapshotId=snapshot"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ jobs: [], conversations: [] });
  expect(state.schedule).toHaveBeenCalledWith("snapshot");
  expect(state.create).not.toHaveBeenCalled();
});

test("a stale working-tree snapshot is rejected before dispatching a review", async () => {
  state.fingerprint = "changed";
  const response = await POST(
    new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "job",
        snapshotId: "00000000-0000-4000-8000-000000000001",
        kind: "review",
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).message).toMatch(/Re-sync/);
  expect(state.create).not.toHaveBeenCalled();
  state.fingerprint = "saved";
});

test("saved review history mutations dispatch to review storage without starting analysis", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const request = (body: object) =>
    new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const renamed = await POST(
    request({ action: "rename-review", id, title: "Saved review" }),
  );
  expect(renamed.status).toBe(200);
  expect(state.rename).toHaveBeenCalledWith(id, "Saved review");
  const deleted = await POST(request({ action: "delete-review", id }));
  expect(deleted.status).toBe(200);
  expect(state.deleteReview).toHaveBeenCalledWith(id);
  expect(state.create).not.toHaveBeenCalled();
});
