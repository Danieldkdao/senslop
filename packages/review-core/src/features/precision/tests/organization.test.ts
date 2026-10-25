import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createTwoFilesPatch } from "diff";
import { LocalStore } from "../../../db/local-store";
import { PrecisionStore } from "../precision-store";
import {
  createReviewUnits,
  reconcileOrganization,
  validateOrganization,
} from "../review-units";
import type { PreviewFileSchema } from "@senslop/contracts";

const paths: string[] = [];
afterEach(() =>
  paths
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);
const file = (
  before: string,
  after: string,
  path = "toolbar.ts",
): PreviewFileSchema => ({
  path,
  oldPath: null,
  before,
  after,
  beforeHash: createHash("sha256").update(before).digest("hex"),
  afterHash: createHash("sha256").update(after).digest("hex"),
  status: "M",
  binary: false,
  added: 2,
  deleted: 2,
  diff: createTwoFilesPatch(path, path, before, after),
});
const before =
  "folder = old\nkeep1\nkeep2\nkeep3\nkeep4\nkeep5\nkeep6\nhotkey = old\n";
const after = before.replaceAll("= old", "= next");

test("regions cover added and deleted source exactly once even inside a single diff hunk", () => {
  const units = createReviewUnits([file(before, after)]);
  expect(units).toHaveLength(2);
  expect(
    units.flatMap((unit) =>
      unit.ranges.map((range) => [range.side, range.start, range.end]),
    ),
  ).toEqual([
    ["before", 1, 1],
    ["after", 1, 1],
    ["before", 8, 8],
    ["after", 8, 8],
  ]);
  const organization = reconcileOrganization(units);
  expect(() =>
    validateOrganization({
      ...organization,
      flows: [
        {
          ...organization.flows[0]!,
          unitIds: units.map((unit) => unit.id).concat(units[0]!.id),
        },
      ],
    }),
  ).toThrow(/once/);
});

test("only unambiguous unchanged regions retain completion and manual placement across rounds", () => {
  const old = reconcileOrganization(createReviewUnits([file(before, after)]));
  old.units[0]!.reviewed = true;
  old.manual = true;
  old.flows[0]!.title = "My flow";
  const next = reconcileOrganization(
    createReviewUnits([
      file(
        `prefix\n${before}`,
        `prefix\n${after.replace("hotkey = next", "hotkey = newer")}`,
      ),
    ]),
    old,
  );
  expect(next.units[0]!.reviewed).toBe(true);
  expect(next.units[0]!.moved).toBe(true);
  expect(next.units[1]!.reviewed).toBe(false);
  expect(
    next.flows.find((flow) => flow.title === "My flow")?.unitIds,
  ).toContain(next.units[0]!.id);
});

test("binary and metadata-only files have explicit fallback units", () => {
  const binary = {
    ...file("", "", "image.png"),
    binary: true,
    before: null,
    after: null,
  };
  expect(createReviewUnits([binary])[0]?.kind).toBe("binary");
  expect(createReviewUnits([file("same", "same")])[0]?.kind).toBe("metadata");
});

test("unit decisions and manual grouping survive restart, update file completion and reject stale writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-precision-"));
  paths.push(directory);
  const database = join(directory, "reviews.sqlite");
  let store = new LocalStore(database);
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
      files: [file(before, after)],
      excluded: [],
    },
    null,
  );
  let precision = new PrecisionStore(store, "/repo");
  let state = precision.organization(review);
  state = precision.changeOrganization(review, state.version, {
    action: "complete-unit",
    unitId: state.units[0]!.id,
    reviewed: true,
  });
  expect(store.getReview("/repo", review.id)?.completedPaths).toEqual([]);
  const staleVersion = state.version;
  state = precision.changeOrganization(review, state.version, {
    action: "complete-unit",
    unitId: state.units[1]!.id,
    reviewed: true,
  });
  expect(store.getReview("/repo", review.id)?.completedPaths).toEqual([
    "toolbar.ts",
  ]);
  expect(() =>
    precision.changeOrganization(review, staleVersion, {
      action: "rename-flow",
      flowId: state.flows[0]!.id,
      title: "Stale",
    }),
  ).toThrow(/changed/);
  state = precision.changeOrganization(review, state.version, {
    action: "rename-flow",
    flowId: state.flows[0]!.id,
    title: "Saved flow",
  });
  store.close();
  store = new LocalStore(database);
  precision = new PrecisionStore(store, "/repo");
  expect(precision.organization(review)).toEqual(state);
  expect(() =>
    new PrecisionStore(store, "/other").organization(review),
  ).toThrow();
  store.close();
});

test("manual split boundaries and their individual completion survive unchanged moved source", () => {
  const original = reconcileOrganization(
    createReviewUnits([file("old\n", "one\ntwo\nthree\n")]),
  );
  const unit = original.units[0]!;
  const afterRange = unit.ranges.find((range) => range.side === "after")!;
  original.manual = true;
  original.units = [
    {
      ...unit,
      id: "first",
      ranges: [unit.ranges[0]!, { ...afterRange, end: 1, code: "one" }],
      reviewed: true,
    },
    {
      ...unit,
      id: "second",
      ranges: [{ ...afterRange, start: 2, code: "two\nthree" }],
      reviewed: false,
    },
  ];
  original.flows = [
    { ...original.flows[0]!, title: "My first behavior", unitIds: ["first"] },
    {
      ...original.flows[0]!,
      id: "flow-two",
      title: "My second behavior",
      unitIds: ["second"],
    },
  ];
  const next = reconcileOrganization(
    createReviewUnits([file("prefix\nold\n", "prefix\none\ntwo\nthree\n")]),
    original,
  );
  expect(next.units).toHaveLength(2);
  expect(next.flows.map((flow) => flow.title)).toEqual([
    "My first behavior",
    "My second behavior",
  ]);
  expect(next.units.find((item) => item.id === "first")?.reviewed).toBe(true);
  expect(next.units.find((item) => item.id === "second")?.reviewed).toBe(false);
  expect(next.units.every((item) => item.moved)).toBe(true);
  expect(validateOrganization(next)).toBe(next);
});

test("identical changed regions stay ambiguous rather than inheriting progress by occurrence ID", () => {
  const repeatedBefore = "old\nkeep\nold\n";
  const repeatedAfter = "next\nkeep\nnext\n";
  const old = reconcileOrganization(
    createReviewUnits([file(repeatedBefore, repeatedAfter)]),
  );
  old.units[0]!.reviewed = true;
  const next = reconcileOrganization(
    createReviewUnits([file(repeatedBefore, repeatedAfter)]),
    old,
  );
  expect(next.units.every((unit) => !unit.reviewed && unit.needsReview)).toBe(
    true,
  );
});

test("legacy saved file groups seed region flows without losing file completion", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-legacy-regions-"));
  paths.push(directory);
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
        files: [file(before, after), file("old", "new", "test.ts")],
        excluded: [],
      },
      null,
    );
    store.enableGrouping("/repo", review.id);
    store.changeReview("/repo", review.id, {
      action: "complete",
      path: "toolbar.ts",
      complete: true,
    });
    store.database.prepare("INSERT INTO ai_jobs VALUES (?,?,?)").run(
      randomUUID(),
      review.id,
      JSON.stringify({
        kind: "grouping",
        status: "completed",
        hash: review.hash,
        snapshotRound: review.round,
        result: {
          groups: [
            {
              title: "Implementation",
              rationale: "Definitions",
              files: [{ path: "toolbar.ts" }],
            },
            {
              title: "Tests",
              rationale: "Tests last",
              files: [{ path: "test.ts" }],
            },
          ],
        },
      }),
    );
    const organization = new PrecisionStore(store, "/repo").organization(
      review,
    );
    expect(organization.flows.map((flow) => flow.title)).toEqual([
      "Implementation",
      "Tests",
    ]);
    expect(
      organization.units
        .filter((unit) => unit.path === "toolbar.ts")
        .every((unit) => unit.reviewed),
    ).toBe(true);
    expect(validateOrganization(organization)).toBe(organization);
  } finally {
    store.close();
  }
});

test("legacy file completion updates its regions while a single-region reversal preserves other progress", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-completion-"));
  paths.push(directory);
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
        files: [file(before, after)],
        excluded: [],
      },
      null,
    );
    const precision = new PrecisionStore(store, "/repo");
    precision.organization(review);
    store.changeReview("/repo", review.id, {
      action: "complete",
      path: "toolbar.ts",
      complete: true,
    });
    const complete = precision.organization(review);
    expect(complete.units.every((unit) => unit.reviewed)).toBe(true);
    const partial = precision.changeOrganization(review, complete.version, {
      action: "complete-unit",
      unitId: complete.units[0]!.id,
      reviewed: false,
    });
    expect(partial.units.map((unit) => unit.reviewed)).toEqual([false, true]);
    expect(
      precision.organization(review).units.map((unit) => unit.reviewed),
    ).toEqual([false, true]);
    expect(store.getReview("/repo", review.id)?.completedPaths).toEqual([]);
  } finally {
    store.close();
  }
});
