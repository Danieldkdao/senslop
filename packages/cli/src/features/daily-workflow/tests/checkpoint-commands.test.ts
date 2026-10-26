import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCheckpointCommand } from "../checkpoint-commands";
import { resolveRepository } from "@senslop/review-core/git";
import { LocalStore } from "@senslop/review-core/storage";
import { PushCheckpoint } from "@senslop/review-core/checkpoint";

test("checkpoint configure initializes a selected missing database, while evaluation still requires saved data", async () => {
  const root = await mkdtemp(join(tmpdir(), "senslop-checkpoint-configure-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const database = join(root, "new-data", "reviews.sqlite"),
      file = join(root, "policy.json");
    const policy = {
      enabled: true,
      requireReviewed: true,
      requireHistory: true,
      blockingSeverity: "high",
      requiredChecks: [],
    };
    await writeFile(file, JSON.stringify(policy));
    await expect(
      executeCheckpointCommand(
        {
          name: "checkpoint configure",
          args: [],
          values: { database, file },
          help: false,
        },
        root,
      ),
    ).resolves.toEqual(policy);
    await access(database);
    const store = new LocalStore(database);
    try {
      expect(
        new PushCheckpoint(store, await resolveRepository(root)).policy(),
      ).toEqual(policy);
    } finally {
      store.close();
    }
    await expect(
      executeCheckpointCommand(
        {
          name: "checkpoint check",
          args: [],
          values: { database: join(root, "absent.sqlite") },
          help: false,
        },
        root,
      ),
    ).rejects.toMatchObject({ code: "checkpoint_unavailable" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
