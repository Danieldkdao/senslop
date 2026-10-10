import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../../../db/local-store";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const preview = () => ({
  id: randomUUID(),
  protocolVersion: 1 as const,
  source: {
    kind: "working-tree" as const,
    base: "a".repeat(40),
    head: null,
    firstParent: false,
  },
  files: [
    {
      path: "file.ts",
      oldPath: null,
      status: "A",
      before: null,
      after: "one\n",
      beforeHash: null,
      afterHash: "a".repeat(64),
      binary: false,
      added: 1,
      deleted: 0,
      diff: "patch",
    },
  ],
  excluded: [],
});
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-history-"));
  directories.push(directory);
  return join(directory, "reviews.sqlite");
};
test("frozen contents, line notes and progress survive reopening the database and stay repository-scoped", async () => {
  const path = await fixture();
  let store = new LocalStore(path);
  const saved = store.saveReview("/repo/one", preview(), "f".repeat(64));
  const note = {
    id: randomUUID(),
    previewId: saved.id,
    path: "file.ts",
    body: "remember",
    line: { side: "additions" as const, lineNumber: 1, code: "one" },
  };
  store.changeReview("/repo/one", saved.id, { action: "add-note", note });
  store.changeReview("/repo/one", saved.id, {
    action: "complete",
    path: "file.ts",
    complete: true,
  });
  store.changeReview("/repo/one", saved.id, {
    action: "select",
    path: "file.ts",
  });
  store.close();
  store = new LocalStore(path);
  try {
    const restored = store.getReview("/repo/one", saved.id)!;
    expect(restored.files[0]?.after).toBe("one\n");
    expect(restored.notes).toEqual([note]);
    expect(restored.completedPaths).toEqual(["file.ts"]);
    expect(restored.selectedPath).toBe("file.ts");
    expect(store.currentReview("/repo/one")?.id).toBe(saved.id);
    expect(store.listReviews("/repo/two")).toEqual([]);
    expect(store.getReview("/repo/two", saved.id)).toBeNull();
    expect(() =>
      store.changeReview("/repo/two", saved.id, {
        action: "rename",
        title: "bad",
      }),
    ).toThrow();
    expect(() => store.deleteReview("/repo/two", saved.id)).toThrow();
  } finally {
    store.close();
  }
});
test("history reopen, rename, note edits and deletion preserve unrelated snapshots", async () => {
  const store = new LocalStore(await fixture());
  try {
    const first = store.saveReview("/repo", preview(), "a".repeat(64));
    const second = store.saveReview("/repo", preview(), "b".repeat(64));
    store.openReview("/repo", first.id);
    expect(store.currentReview("/repo")?.id).toBe(first.id);
    const note = {
      id: randomUUID(),
      previewId: first.id,
      path: "file.ts",
      body: "draft",
      line: null,
    };
    store.changeReview("/repo", first.id, { action: "add-note", note });
    store.changeReview("/repo", first.id, { action: "add-note", note });
    expect(store.getReview("/repo", first.id)?.notes).toHaveLength(1);
    store.changeReview("/repo", first.id, {
      action: "edit-note",
      id: note.id,
      body: "edited",
    });
    store.changeReview("/repo", first.id, {
      action: "rename",
      title: "My review",
    });
    expect(
      store.listReviews("/repo").find((review) => review.id === first.id)
        ?.title,
    ).toBe("My review");
    expect(store.getReview("/repo", first.id)?.notes[0]?.body).toBe("edited");
    store.changeReview("/repo", first.id, {
      action: "delete-note",
      id: note.id,
    });
    expect(store.getReview("/repo", first.id)?.notes).toEqual([]);
    store.deleteReview("/repo", first.id);
    expect(store.getReview("/repo", first.id)).toBeNull();
    expect(store.listReviews("/repo").map((review) => review.id)).toEqual([
      second.id,
    ]);
    expect(store.currentReview("/repo")).toBeNull();
  } finally {
    store.close();
  }
});
test("independent writers do not lose notes, invalid references fail, and deleted source is removed", async () => {
  const path = await fixture();
  const one = new LocalStore(path);
  const two = new LocalStore(path);
  try {
    const data = preview();
    data.files[0]!.after = "unique-deleted-source-content";
    const saved = one.saveReview("/repo", data, "f".repeat(64));
    const note = (body: string) => ({
      id: randomUUID(),
      previewId: saved.id,
      path: "file.ts",
      body,
      line: null,
    });
    one.changeReview("/repo", saved.id, {
      action: "add-note",
      note: note("first"),
    });
    two.changeReview("/repo", saved.id, {
      action: "add-note",
      note: note("second"),
    });
    expect(one.getReview("/repo", saved.id)?.notes).toHaveLength(2);
    expect(() =>
      one.changeReview("/repo", saved.id, {
        action: "add-note",
        note: { ...note("bad"), path: "foreign.ts" },
      }),
    ).toThrow();
    one.deleteReview("/repo", saved.id);
  } finally {
    one.close();
    two.close();
  }
  expect(
    (await readFile(path)).includes(
      Buffer.from("unique-deleted-source-content"),
    ),
  ).toBe(false);
});
test("database search matches review names literally and remains scoped after rename and deletion", async () => {
  const store = new LocalStore(await fixture());
  try {
    const one = store.saveReview("/repo", preview(), null);
    store.changeReview("/repo", one.id, {
      action: "rename",
      title: "Fix 100%_coverage",
    });
    store.saveReview("/other", preview(), null);
    expect(
      store.listReviews("/repo", "100%_").map((review) => review.id),
    ).toEqual([one.id]);
    expect(store.listReviews("/other", "100%_")).toEqual([]);
    expect(store.listReviews("/repo", "missing")).toEqual([]);
    store.deleteReview("/repo", one.id);
    expect(store.listReviews("/repo", "coverage")).toEqual([]);
  } finally {
    store.close();
  }
});
