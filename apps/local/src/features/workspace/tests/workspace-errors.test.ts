import { afterEach, expect, test, vi } from "vitest";
import { GET } from "../../../app/api/preview/route";

const state = vi.hoisted(() => ({ current: vi.fn(), allowed: true }));
vi.mock(
  "@/features/workspace/lib/server-workspace",
  async (importOriginal) => ({
    ...(await importOriginal<typeof import("../lib/server-workspace")>()),
    getWorkspace: () => ({ current: state.current }),
    protectLocalRoute: () => state.allowed,
  }),
);
afterEach(() => {
  vi.clearAllMocks();
  state.allowed = true;
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
