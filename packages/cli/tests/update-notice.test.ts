import { beforeEach, expect, test, vi } from "vitest";
const update = vi.hoisted(() => ({ install: vi.fn(), release: vi.fn() }));
vi.mock("@senslop/review-core/storage", () => ({
  LocalStore: class {
    close = () => {};
  },
}));
vi.mock("@senslop/review-core/updates", () => ({
  cachedRelease: update.release,
  installRelease: update.install,
  detectInstallation: () => "npm",
}));
vi.mock("../src/features/workspace/runtime-paths", () => ({
  applicationDataDirectory: () => "/tmp/senslop-update-test",
}));
import {
  executeUpdateCommand,
  notifyCliUpdate,
} from "../src/features/updates/commands";
beforeEach(() => {
  vi.clearAllMocks();
  update.release.mockResolvedValue({
    current: "0.1.0",
    latest: "0.2.0",
    available: true,
  });
});
test("upgrades require confirmation and JSON commands skip automatic prompts", async () => {
  await notifyCliUpdate(["reviews", "--json"]);
  expect(update.release).not.toHaveBeenCalled();
  await expect(
    executeUpdateCommand({
      name: "update",
      args: [],
      values: { json: true },
      help: false,
    }),
  ).rejects.toThrow(/--yes/);
  expect(update.install).not.toHaveBeenCalled();
  await executeUpdateCommand({
    name: "update",
    args: [],
    values: { json: true, yes: true },
    help: false,
  });
  expect(update.install).toHaveBeenCalledOnce();
});
