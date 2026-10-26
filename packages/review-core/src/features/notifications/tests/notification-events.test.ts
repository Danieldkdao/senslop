import { expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalStore } from "../../../db/local-store";
import {
  claimNotification,
  completeNotification,
  notificationCompleted,
  releaseNotification,
  recordNotification,
  listNotifications,
} from "../notification-events";

test("notification claims are shared across connections and scoped to the project and owner", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-notification-claims-"));
  const first = new LocalStore(join(directory, "state.sqlite"));
  const second = new LocalStore(join(directory, "state.sqlite"));
  try {
    recordNotification(first, "/repo", {
      id: "event",
      kind: "review",
      reviewId: null,
      title: "Complete",
    });
    expect(claimNotification(first, "/other", "event", "first")).toBe(false);
    expect(claimNotification(first, "/repo", "event", "first")).toBe(true);
    expect(claimNotification(second, "/repo", "event", "second")).toBe(false);
    releaseNotification(second, "/repo", "event", "second");
    expect(claimNotification(second, "/repo", "event", "second")).toBe(false);
    releaseNotification(first, "/repo", "event", "first");
    expect(claimNotification(second, "/repo", "event", "second")).toBe(true);
    expect(listNotifications(second, "/repo", 0)).toHaveLength(1);
  } finally {
    first.close();
    second.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an abandoned claim expires so a later browser can recover the event", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-notification-expiry-"));
  const store = new LocalStore(join(directory, "state.sqlite"));
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    recordNotification(store, "/repo", {
      id: "event",
      kind: "review",
      reviewId: null,
      title: "Complete",
    });
    expect(claimNotification(store, "/repo", "event", "closed-tab")).toBe(true);
    expect(claimNotification(store, "/repo", "event", "later-tab")).toBe(false);
    clock.mockReturnValue(121001);
    expect(claimNotification(store, "/repo", "event", "later-tab")).toBe(true);
    expect(completeNotification(store, "/repo", "event", "closed-tab")).toBe(
      false,
    );
    expect(completeNotification(store, "/repo", "event", "later-tab")).toBe(
      true,
    );
    expect(notificationCompleted(store, "/repo", "event")).toBe(true);
    clock.mockReturnValue(500000);
    releaseNotification(store, "/repo", "event", "later-tab");
    expect(claimNotification(store, "/repo", "event", "third-tab")).toBe(false);
  } finally {
    clock.mockRestore();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
