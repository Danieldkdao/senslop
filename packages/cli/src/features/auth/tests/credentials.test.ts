import { test, expect } from "vitest";
import { mkdtemp, stat, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveCredentials,
  readCredentials,
  removeCredentials,
} from "../credentials.js";

test("credentials are private, round-trip locally, and remove only after logout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-credentials-"));
  try {
    expect(await readCredentials(directory)).toBe(null);
    await saveCredentials(
      { baseURL: "http://localhost:3000", token: "test-fixture-token" },
      directory,
    );
    expect((await readCredentials(directory))?.token).toBe(
      "test-fixture-token",
    );
    if (process.platform !== "win32") {
      expect(
        (await stat(join(directory, "credentials.json"))).mode & 0o777,
      ).toBe(0o600);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    }
    await removeCredentials(directory);
    expect(await readCredentials(directory)).toBe(null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([
  "{invalid",
  JSON.stringify({ baseURL: "http://remote.example", token: "fixture" }),
])(
  "unreadable credentials return null without changing the file",
  async (contents) => {
    const directory = await mkdtemp(
      join(tmpdir(), "senslop-invalid-credentials-"),
    );
    try {
      await writeFile(join(directory, "credentials.json"), contents);
      await expect(readCredentials(directory)).resolves.toBeNull();
      expect(await readFile(join(directory, "credentials.json"), "utf8")).toBe(
        contents,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
