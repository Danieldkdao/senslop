import { expect, test, vi } from "vitest";
import {
  checkRelease,
  compareReleaseVersions,
  updateArguments,
} from "../update-service";

test("version checks use stable release numbers and never invent an unpublished release", async () => {
  expect(compareReleaseVersions("0.10.0", "0.9.9")).toBe(1);
  expect(compareReleaseVersions("0.1.0", "0.1.0")).toBe(0);
  const unavailable = await checkRelease(
    "0.1.0",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  expect(unavailable.latest).toBe(null);
  expect(unavailable.available).toBe(false);
  const request = vi.fn(async () =>
    Response.json({ name: "senslop", version: "0.2.0" }),
  );
  const available = await checkRelease("0.1.0", request);
  expect(available.available).toBe(true);
  expect(request).toHaveBeenCalledWith(
    "https://registry.npmjs.org/senslop/latest",
    expect.any(Object),
  );
  const wrongPackage = await checkRelease("0.1.0", async () =>
    Response.json({ name: "unrelated-cli", version: "0.2.0" }),
  );
  expect(wrongPackage.available).toBe(false);
});

test("updates pin a validated release and use argument arrays", () => {
  expect(updateArguments("npm", "0.2.0")).toEqual([
    "install",
    "--global",
    "senslop@0.2.0",
  ]);
  expect(() => updateArguments("npm", "$(malicious)")).toThrow();
  expect(updateArguments("pnpm", "0.2.0")).toEqual([
    "add",
    "--global",
    "senslop@0.2.0",
  ]);
});

test("updating refuses to replace files while another local app owns a session", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
    await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { assertNoRunningApps } = await import("../update-service");
  const directory = mkdtempSync(join(tmpdir(), "senslop-update-owner-"));
  try {
    mkdirSync(join(directory, "jobs", "workspace"), { recursive: true });
    writeFileSync(
      join(directory, "jobs", "workspace", "session.json"),
      JSON.stringify({ pid: process.pid }),
    );
    expect(() =>
      assertNoRunningApps(join(directory, "reviews.sqlite")),
    ).toThrow(/Stop.*app/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("installation detection follows the executable symlink for global npm installs", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } =
    await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { detectInstallation } = await import("../update-service");
  const directory = mkdtempSync(join(tmpdir(), "senslop-installation-"));
  try {
    const entry = join(directory, "lib/node_modules/senslop/dist/index.js");
    mkdirSync(join(directory, "bin"), { recursive: true });
    mkdirSync(join(directory, "lib/node_modules/senslop/dist"), {
      recursive: true,
    });
    writeFileSync(entry, "");
    const executable = join(directory, "bin/senslop");
    symlinkSync(entry, executable);
    expect(detectInstallation(executable)).toBe("npm");
    expect(detectInstallation(join(directory, "missing"))).toBe("unknown");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
