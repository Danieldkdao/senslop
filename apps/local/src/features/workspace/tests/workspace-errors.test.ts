import { afterEach, expect, test, vi } from "vitest";
import { GET } from "../../../app/api/preview/route";
import {
  GET as getMetadata,
  POST as postWorkspace,
} from "../../../app/api/workspace/route";

vi.mock("../../../services/inngest/functions", () => ({
  scheduleGrouping: vi.fn(async () => {}),
}));
const state = vi.hoisted(() => ({
  current: vi.fn(),
  resync: vi.fn(),
  inspect: vi.fn(),
  changeReview: vi.fn(),
  root: vi.fn().mockResolvedValue("/repository"),
  repository: vi.fn().mockResolvedValue({ fingerprint: "fresh" }),
  listReviews: vi.fn().mockReturnValue([]),
  allowed: true,
}));
vi.mock(
  "@/features/workspace/lib/server-workspace",
  async (importOriginal) => ({
    ...(await importOriginal<typeof import("../lib/server-workspace")>()),
    getWorkspace: () => ({
      current: state.current,
      resync: state.resync,
      inspect: state.inspect,
      root: state.root,
      repository: state.repository,
      store: {
        listReviews: state.listReviews,
        changeReview: state.changeReview,
      },
    }),
    protectLocalRoute: () => state.allowed,
  }),
);
afterEach(() => {
  vi.clearAllMocks();
  state.allowed = true;
});

test("metadata polling loads saved history only on an explicit history request", async () => {
  const metadata = await getMetadata(
    new Request("http://localhost/api/workspace"),
  );
  expect(metadata.status).toBe(200);
  expect(await metadata.json()).toMatchObject({
    history: [],
    repository: { fingerprint: "fresh" },
  });
  expect(state.listReviews).not.toHaveBeenCalled();
  state.repository.mockClear();
  const history = await getMetadata(
    new Request("http://localhost/api/workspace?history=1&search=saved"),
  );
  expect(await history.json()).toMatchObject({ repository: null, history: [] });
  expect(state.repository).not.toHaveBeenCalled();
  expect(state.listReviews).toHaveBeenCalledExactlyOnceWith(
    "/repository",
    "saved",
  );
});

test("preview errors explain upgrade recovery while keeping internal paths and source out of responses", async () => {
  const upgrade =
    "Local data was created by a newer Senslop. Upgrade the CLI to open it.";
  state.current.mockRejectedValueOnce(new Error(upgrade));
  const response = await GET(new Request("http://localhost/api/preview"));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ message: upgrade });
  state.current.mockRejectedValueOnce(
    new Error("SQL error private-repository-source"),
  );
  const failed = await GET(new Request("http://localhost/api/preview"));
  expect(JSON.stringify(await failed.json())).not.toContain(
    "private-repository-source",
  );
  state.allowed = false;
  expect((await GET(new Request("http://localhost/api/preview"))).status).toBe(
    403,
  );
});

test("re-sync validates its repository-bound action and returns useful no-change errors", async () => {
  const id = crypto.randomUUID();
  const request = () =>
    new Request("http://localhost/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resync", id }),
    });
  state.resync.mockResolvedValueOnce({ id: "next-round" });
  const response = await postWorkspace(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: "next-round" });
  expect(state.resync).toHaveBeenCalledWith(id, undefined, undefined);
  state.resync.mockRejectedValueOnce(
    new Error(
      "No new changes since this review round. Make more edits before re-syncing.",
    ),
  );
  const unchanged = await postWorkspace(request());
  expect(unchanged.status).toBe(422);
  expect(await unchanged.json()).toMatchObject({
    message: expect.stringContaining("No new changes"),
  });
  state.allowed = false;
  expect((await postWorkspace(request())).status).toBe(403);
});

test("diff preparation failures explain the affected file instead of blaming local storage", async () => {
  state.inspect.mockRejectedValueOnce(
    new Error(
      "Diff generation exceeded its time limit (pnpm-lock.yaml). Retry with a smaller Git selection.",
    ),
  );
  const response = await postWorkspace(
    new Request("http://localhost/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "inspect",
        source: { kind: "working-tree" },
      }),
    }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    message:
      "Diff generation exceeded its time limit (pnpm-lock.yaml). Retry with a smaller Git selection.",
  });
});

test("re-sync forwards its mode and per-run grouping choice and rejects unsupported modes", async () => {
  const id = crypto.randomUUID();
  state.resync.mockResolvedValue({ id });
  const request = (mode: string) =>
    new Request("http://localhost/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resync", id, mode, grouping: false }),
    });
  expect((await postWorkspace(request("keep"))).status).toBe(200);
  expect(state.resync).toHaveBeenCalledWith(id, "keep", false);
  expect((await postWorkspace(request("unsupported"))).status).toBe(400);
  expect(state.resync).toHaveBeenCalledTimes(1);
});

test("navigation and completion can request compact state without retransferring frozen source", async () => {
  const id = crypto.randomUUID();
  const saved = {
    id,
    hash: "a".repeat(64),
    round: 1,
    revision: 2,
    title: "Review",
    notes: [],
    completedPaths: ["large.ts"],
    selectedPath: "large.ts",
    updatedAt: new Date().toISOString(),
    files: [{ path: "large.ts", after: "source".repeat(100000) }],
  };
  state.changeReview.mockReturnValue(saved);
  const response = await postWorkspace(
    new Request("http://localhost/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "change",
        id,
        expectedHash: saved.hash,
        expectedRound: saved.round,
        change: { action: "complete", path: "large.ts", complete: true },
        response: "state",
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(state.changeReview).toHaveBeenCalledWith(
    "/repository",
    id,
    expect.any(Object),
    { hash: saved.hash, round: saved.round },
  );
  const data = await response.json();
  expect(data.completedPaths).toEqual(["large.ts"]);
  expect(data.files).toBeUndefined();
  expect(JSON.stringify(data).length).toBeLessThan(1000);
});

test("review changes require the expected contents and round", async () => {
  const response = await postWorkspace(
    new Request("http://localhost/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "change",
        id: crypto.randomUUID(),
        change: { action: "complete", path: "a.ts", complete: true },
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(state.changeReview).not.toHaveBeenCalled();
});
