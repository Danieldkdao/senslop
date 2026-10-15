import { expect, test } from "vitest";
import {
  prepareIncrementalGrouping,
  mergeIncrementalGrouping,
} from "../incremental-grouping";
import type { SavedReviewSchema } from "@senslop/contracts";

const previous = {
  files: [
    { path: "a", beforeHash: "0", afterHash: "1" },
    { path: "b", beforeHash: "0", afterHash: "1" },
    { path: "deleted", beforeHash: "0", afterHash: "1" },
  ],
} as SavedReviewSchema;
const snapshot = {
  files: [
    { path: "a", beforeHash: "0", afterHash: "2" },
    { path: "b", beforeHash: "0", afterHash: "1" },
    { path: "new", beforeHash: null, afterHash: "1" },
  ],
} as SavedReviewSchema;
const groups = {
  groups: [
    {
      title: "Flow",
      rationale: "Order",
      files: [
        { path: "a", summary: "old", related: [] },
        { path: "b", summary: "KEEP", related: ["deleted"] },
        { path: "deleted", summary: "gone", related: [] },
      ],
    },
  ],
};

test("incremental grouping regenerates only changed/new files and prunes removed paths", () => {
  const seed = prepareIncrementalGrouping(snapshot, previous, groups);
  expect(seed.retained.groups[0]?.files).toEqual([
    { path: "b", summary: "KEEP", related: [] },
  ]);
  expect(seed.context.groups[0]?.files.map((file) => file.path)).toEqual([
    "a",
    "b",
  ]);
  const result = mergeIncrementalGrouping(
    snapshot,
    seed.retained,
    {
      groups: [
        {
          title: seed.context.groups[0]!.title,
          rationale: "updated",
          files: [{ path: "a", summary: "fresh", related: [] }],
        },
        {
          title: "New flow",
          rationale: "new",
          files: [{ path: "new", summary: "new", related: [] }],
        },
      ],
    },
    seed.aliases,
  );
  expect(
    result.groups.map((group) => group.files.map((file) => file.path)),
  ).toEqual([["b", "a"], ["new"]]);
  expect(result.groups[0]?.files[0]?.summary).toBe("KEEP");
  expect(() =>
    mergeIncrementalGrouping(snapshot, seed.retained, { groups: [] }),
  ).toThrow(/coverage/);
});

test("groups with the same title have distinct repair context and keep their original titles after merging", () => {
  const old = {
    files: [
      { path: "a", beforeHash: "0", afterHash: "1" },
      { path: "b", beforeHash: "0", afterHash: "1" },
    ],
  } as SavedReviewSchema;
  const current = {
    files: [
      { path: "a", beforeHash: "0", afterHash: "1" },
      { path: "b", beforeHash: "0", afterHash: "2" },
    ],
  } as SavedReviewSchema;
  const oldGroups = {
    groups: [
      {
        title: "Flow",
        rationale: "First",
        files: [{ path: "a", summary: "KEEP", related: [] }],
      },
      {
        title: "Flow",
        rationale: "Second",
        files: [{ path: "b", summary: "old", related: [] }],
      },
    ],
  };
  const seed = prepareIncrementalGrouping(current, old, oldGroups);
  expect(seed.context.groups[0]?.title).not.toBe(seed.context.groups[1]?.title);
  const result = mergeIncrementalGrouping(
    current,
    seed.retained,
    {
      groups: [
        {
          title: seed.context.groups[1]!.title,
          rationale: "Second",
          files: [{ path: "b", summary: "fresh", related: [] }],
        },
      ],
    },
    seed.aliases,
  );
  expect(
    result.groups.map((group) => [group.title, group.files[0]?.path]),
  ).toEqual([
    ["Flow", "a"],
    ["Flow", "b"],
  ]);
});

test("updated existing groups and files retain their positions when their summaries are replaced", () => {
  const old = {
    files: [
      { path: "a", beforeHash: "0", afterHash: "1" },
      { path: "b", beforeHash: "0", afterHash: "1" },
      { path: "c", beforeHash: "0", afterHash: "1" },
    ],
  } as SavedReviewSchema;
  const current = {
    files: [{ ...old.files[0]!, afterHash: "2" }, old.files[1]!, old.files[2]!],
  } as SavedReviewSchema;
  const grouping = {
    groups: [
      {
        title: "First",
        rationale: "First",
        files: [
          { path: "a", summary: "old", related: [] },
          { path: "b", summary: "KEEP", related: [] },
        ],
      },
      {
        title: "Last",
        rationale: "Last",
        files: [{ path: "c", summary: "KEEP", related: [] }],
      },
    ],
  };
  const seed = prepareIncrementalGrouping(current, old, grouping);
  const updated = {
    groups: [
      {
        title: seed.context.groups[0]!.title,
        rationale: "First",
        files: [{ path: "a", summary: "fresh", related: [] }],
      },
    ],
  };
  const result = mergeIncrementalGrouping(
    current,
    seed.retained,
    updated,
    seed.aliases,
    seed.context,
  );
  expect(
    result.groups.map((group) => group.files.map((file) => file.path)),
  ).toEqual([["a", "b"], ["c"]]);
});
