import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalApp } from "../src/features/workspace/local-app";
import { buddyCharacters } from "../../../apps/local/src/features/buddy/constants";
import { formatBuddyCharacter } from "../../../apps/local/src/features/buddy/lib/formatters";

// This artifact test reads its tooling-only selection flag outside application env.
const packagedTest = test.skipIf(process.env.SENSLOP_PACK_TEST !== "1");

test("every buddy retains the same source resolution as Pip", async () => {
  const pip = await readFile(
    new URL("../../../apps/local/public/buddy/pip-poses.png", import.meta.url),
  );
  for (const character of buddyCharacters) {
    const { spriteSheet } = formatBuddyCharacter(character);
    const atlas = await readFile(
      new URL(`../../../apps/local/public${spriteSheet}`, import.meta.url),
    );
    expect([atlas.readUInt32BE(16), atlas.readUInt32BE(20)], character).toEqual(
      [pip.readUInt32BE(16), pip.readUInt32BE(20)],
    );
  }
});

packagedTest(
  "the bundled standalone workspace serves all five complete pose atlases",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-buddy-assets-"));
    let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
    try {
      app = await startLocalApp({
        dataDirectory: directory,
        serverPath: fileURLToPath(
          new URL("../dist/local-app/apps/local/server.js", import.meta.url),
        ),
        jobs: false,
      });
      const session = await fetch(app.url, { redirect: "manual" });
      const cookie = session.headers.get("set-cookie")!.split(";")[0];
      for (const character of buddyCharacters) {
        const { spriteSheet } = formatBuddyCharacter(character);
        const response = await fetch(`${app.origin}${spriteSheet}`, {
          headers: { Cookie: cookie },
        });
        expect(response.status, character).toBe(200);
        expect(response.headers.get("content-type")).toContain("image/png");
        const expected = await readFile(
          new URL(`../../../apps/local/public${spriteSheet}`, import.meta.url),
        );
        expect(
          Buffer.from(await response.arrayBuffer()).equals(expected),
          character,
        ).toBe(true);
      }
    } finally {
      await app?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);
