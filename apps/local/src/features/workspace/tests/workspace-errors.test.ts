import { afterEach, expect, test, vi } from "vitest";
import { GET } from "../../../app/api/preview/route";
import { GET as getMetadata } from "../../../app/api/workspace/route";

const state = vi.hoisted(() => ({
  current: vi.fn(),
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
      root: state.root,
      repository: state.repository,
      store: { listReviews: state.listReviews },
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
