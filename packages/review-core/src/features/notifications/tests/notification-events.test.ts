import { expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalStore } from "../../../db/local-store";
import {
  claimNotification,
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
