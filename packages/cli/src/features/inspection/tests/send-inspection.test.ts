import { expect, test, vi } from "vitest";
import { sendInspection } from "../send-inspection";
import type { FrozenSnapshot } from "../../git/snapshot";

vi.mock("../../auth/credentials", () => ({
  requireCredentials: async () => ({
    baseURL: "http://localhost:3000",
    token: "secret",
  }),
}));
vi.mock("../../connection/fetch-status", () => ({
  fetchStatus: async () => ({
    connectionUrl: "ws://localhost:3100/connection",
  }),
}));

test("inspection sends only bounded snapshot data to the validated service over HTTP", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ previewId: "id", fileCount: 1 }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  try {
    const snapshot = {
      source: {
        kind: "working-tree",
        base: "a".repeat(40),
        head: null,
        firstParent: false,
      },
      files: [{ path: "file.ts" }],
      excluded: [],
      frozenContents: { duplicate: "omit this" },
    } as unknown as FrozenSnapshot;
    await sendInspection(snapshot);
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:3100/preview");
    expect(options.headers.get("Authorization")).toBe("Bearer secret");
    expect(JSON.parse(options.body)).not.toHaveProperty("frozenContents");
    expect(JSON.parse(options.body).files).toEqual(snapshot.files);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("inspection surfaces delivery failure rather than claiming an upload succeeded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Open your dashboard" }), {
        status: 409,
      }),
    ),
  );
  try {
    await expect(
      sendInspection({
        source: {},
        files: [{ path: "file.ts" }],
        excluded: [],
      } as unknown as FrozenSnapshot),
    ).rejects.toThrow("Open your dashboard");
  } finally {
    vi.unstubAllGlobals();
  }
});
