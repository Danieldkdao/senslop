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
  const available = await checkRelease(
    "0.1.0",
    vi.fn(async () =>
      Response.json({ name: "@senslop/cli", version: "0.2.0" }),
    ),
  );
  expect(available.available).toBe(true);
});

test("updates pin a validated release and use argument arrays", () => {
  expect(updateArguments("npm", "0.2.0")).toEqual([
    "install",
    "--global",
    "@senslop/cli@0.2.0",
  ]);
  expect(() => updateArguments("npm", "$(malicious)")).toThrow();
  expect(updateArguments("pnpm", "0.2.0")).toEqual([
    "add",
    "--global",
    "@senslop/cli@0.2.0",
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
