import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installCheckpointHook,
  removeCheckpointHook,
} from "../checkpoint-hook";

test("terminal wrapper preserves the old hook and refuses to erase an edited wrapper", async () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-hook-"));
  try {
    execFileSync("git", ["init", "-q", directory]);
    const path = join(directory, ".git/hooks/pre-push");
    const original = "#!/bin/sh\nexit 0\n";
    writeFileSync(path, original, { mode: 0o755 });
    await installCheckpointHook(directory, ["senslop"], "/tmp/reviews.sqlite");
    const owned = readFileSync(path, "utf8");
    writeFileSync(path, owned.replace("cat >", "echo custom-check >&2\ncat >"));
    await expect(removeCheckpointHook(directory)).rejects.toThrow(
      /edited|inspection/,
    );
    writeFileSync(path, owned);
    await removeCheckpointHook(directory);
    expect(readFileSync(path, "utf8")).toBe(original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
