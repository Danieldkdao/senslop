import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { osCredentials } from "../os-credentials";

// This opt-in touches the real OS store, using only a disposable test entry.
test.skipIf(process.env.RUN_OS_CREDENTIAL_TESTS !== "1")(
  "the installed native adapter saves, reads and deletes a real OS credential",
  async () => {
    const id = randomUUID();
    const secret = randomUUID();
    try {
      expect(await osCredentials.get(id)).toBeNull();
      await osCredentials.set(id, secret);
      expect(await osCredentials.get(id)).toBe(secret);
    } finally {
      await osCredentials.delete(id);
    }
    expect(await osCredentials.get(id)).toBeNull();
  },
  30000,
);
