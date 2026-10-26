import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../../../db/local-store";
import { ProjectMemory } from "../project-memory";
import { readReviewInstructions } from "../../precision/review-rules";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

test("remembered guidance is explicit, versioned, scoped and removable", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-memory-"));
  directories.push(directory);
  const store = new LocalStore(join(directory, "state.sqlite"));
  try {
    const review = store.saveReview(
      "/repo",
      {
        id: randomUUID(),
        protocolVersion: 1,
        source: {
          kind: "working-tree",
          base: "a".repeat(40),
          head: null,
          firstParent: false,
        },
        files: [],
        excluded: [],
      },
      null,
    );
    const memory = new ProjectMemory(store, "/repo");
    const entry = memory.create({
      text: "Retry only idempotent requests",
      paths: ["src/api/**"],
      assumption: "Requests have an idempotency key",
      review,
      originId: null,
      originKind: "review",
    });
    expect(new ProjectMemory(store, "/other").list()).toEqual([]);
    expect(
      readReviewInstructions(store, "/repo", review.id).rules.some(
        (rule) => rule.id === entry.id,
      ),
    ).toBe(true);
    const updated = memory.update(entry.id, entry.version, {
      ...entry,
      enabled: false,
    });
    expect(updated.history).toHaveLength(2);
    expect(() => memory.update(entry.id, entry.version, entry)).toThrow(
      /changed/,
    );
    expect(
      readReviewInstructions(store, "/repo", review.id).rules.some(
        (rule) => rule.id === entry.id && rule.enabled,
      ),
    ).toBe(false);
    memory.remove(updated.id, updated.version);
    expect(memory.list()).toEqual([]);
  } finally {
    store.close();
  }
});
