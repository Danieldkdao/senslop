import { expect, test } from "vitest";
import type { SavedReviewSchema } from "@senslop/contracts";
import { compareRounds } from "../lib/compare-rounds";
const file = {
  path: "file.ts",
  oldPath: null,
  status: "M",
  before: "base",
  after: "first",
  beforeHash: "a".repeat(64),
  afterHash: "b".repeat(64),
  binary: false,
  added: 1,
  deleted: 1,
  diff: "patch",
};
test("round comparison shows a reverted file against its previous reviewed contents", () => {
  const left = { files: [file] } as SavedReviewSchema;
  const right = { files: [] } as unknown as SavedReviewSchema;
  expect(compareRounds(left, right)[0]).toMatchObject({
    before: "first",
    after: "base",
  });
});
test("unchanged files are omitted and renames compare previous and current contents", () => {
  const left = { files: [file] } as SavedReviewSchema;
  expect(compareRounds(left, left)).toEqual([]);
  const right = {
    files: [
      {
        ...file,
        path: "renamed.ts",
        oldPath: "file.ts",
        status: "R100",
        after: "second",
      },
    ],
  } as SavedReviewSchema;
  expect(compareRounds(left, right)).toHaveLength(1);
  expect(compareRounds(left, right)[0]).toMatchObject({
    path: "renamed.ts",
    before: "first",
    after: "second",
  });
});
