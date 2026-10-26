import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalStore } from "@senslop/review-core/storage";
import { recordNotification } from "@senslop/review-core/notifications";
import { GET, POST } from "../../../app/api/notifications/route";
const state = vi.hoisted(() => ({
  authorized: true,
  root: "/repo",
  store: null as LocalStore | null,
}));
vi.mock("../../workspace/lib/server-workspace", () => ({
  protectLocalRoute: () => state.authorized,
  readLocalBody: (request: Request) => request.json(),
  getWorkspace: () => ({ store: state.store, root: async () => state.root }),
}));
afterEach(() => {
  state.authorized = true;
  state.root = "/repo";
});
test("the protected notification API claims once, rejects other projects and releases only its owner", async () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-notification-route-"));
  state.store = new LocalStore(join(directory, "state.sqlite"));
  const action = (body: unknown) =>
    POST(
      new Request("http://localhost/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  try {
    recordNotification(state.store, "/repo", {
      id: "event",
      kind: "review",
      reviewId: null,
      title: "Done",
    });
    const owner = randomUUID();
    state.authorized = false;
    expect((await action({ action: "claim", id: "event", owner })).status).toBe(
      403,
    );
    state.authorized = true;
    expect(
      (await action({ action: "claim", id: "event", owner: "invalid" })).status,
    ).toBe(400);
    state.root = "/other";
    expect(
      await (await action({ action: "claim", id: "event", owner })).json(),
    ).toEqual({ claimed: false });
    state.root = "/repo";
    expect(
      await (await action({ action: "claim", id: "event", owner })).json(),
    ).toEqual({ claimed: true });
    expect(
      await (
        await action({ action: "claim", id: "event", owner: randomUUID() })
      ).json(),
    ).toEqual({ claimed: false });
    await action({ action: "release", id: "event", owner });
    expect(
      await (
        await action({ action: "claim", id: "event", owner: randomUUID() })
      ).json(),
    ).toEqual({ claimed: true });
    const feed = await (
      await GET(new Request("http://localhost/api/notifications?after=0"))
    ).json();
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0].delivery).toBeUndefined();
  } finally {
    state.store.close();
    state.store = null;
    rmSync(directory, { recursive: true, force: true });
  }
});
