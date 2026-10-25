import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../../../db/local-store";
import { ReviewIntent } from "../review-intent";
import {
  resolveReviewInstructions,
  applicableReviewProfiles,
  applicableReviewRules,
  saveReviewOverrides,
} from "../review-rules";

const paths: string[] = [];
afterEach(() =>
  paths
    .splice(0)
    .forEach((path) => rmSync(path, { force: true, recursive: true })),
);

test("rules have explicit precedence, scoped sources, conflicts and unknown configuration feedback", () => {
  const instructions = resolveReviewInstructions(
    {
      "AGENTS.md": "Use transactions.",
      ".senslop/review.json": JSON.stringify({
        profiles: ["correctness"],
        rules: [{ id: "transactions", text: "Use a transaction." }],
        instructionFiles: ["AGENTS.md"],
        unknownSetting: true,
      }),
      "src/.senslop/review.json": JSON.stringify({
        profiles: ["security"],
        rules: [{ id: "transactions", text: "Use serializable transactions." }],
      }),
    },
    { profiles: ["performance"] },
    { profiles: ["accessibility"] },
  );
  expect(instructions.profiles).toEqual(["accessibility"]);
  expect(
    instructions.rules.find(
      (rule) => rule.id === "transactions" && rule.scope === "src/",
    )?.text,
  ).toContain("serializable");
  expect(
    instructions.rules.find((rule) => rule.source === "AGENTS.md")?.text,
  ).toBe("Use transactions.");
  expect(instructions.limitations.join(" ")).toMatch(/unknownSetting/);
});

test("brief versions retain original attachments and stale editors cannot overwrite newer intent", () => {
  const path = mkdtempSync(join(tmpdir(), "senslop-intent-"));
  paths.push(path);
  const store = new LocalStore(join(path, "state.sqlite"));
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
    const intent = new ReviewIntent(store, "/repo");
    const first = intent.saveBrief(review, 0, {
      request: "Handle null input",
      criteria: [
        {
          id: "null",
          text: "Null input does not throw",
          sourceQuote: "Handle null input",
          checkIds: [],
        },
      ],
      documents: [
        { path: "requirements.md", contents: "Original requirement" },
      ],
      links: [],
    });
    const second = intent.saveBrief(review, first.version, {
      ...first,
      request: "Handle empty input",
    });
    expect(second.version).toBe(2);
    expect(intent.briefs(review.id)[1]?.documents[0]?.contents).toBe(
      "Original requirement",
    );
    expect(() =>
      intent.saveBrief(review, 1, { ...first, request: "stale" }),
    ).toThrow(/changed/);
    expect(new ReviewIntent(store, "/other").briefs(review.id)).toEqual([]);
    saveReviewOverrides(
      store,
      "/repo",
      {
        rules: [
          {
            id: "temporary",
            text: "Temporary review instructions",
            paths: ["**/*"],
            enabled: true,
          },
        ],
      },
      review.id,
    );
    store.deleteReview("/repo", review.id);
    expect(
      store.database
        .prepare("SELECT body FROM review_briefs WHERE review_id=?")
        .get(review.id),
    ).toBeUndefined();
    expect(
      store.database
        .prepare("SELECT value FROM preferences WHERE name=?")
        .get(`review_rules:${review.id}`),
    ).toBeUndefined();
  } finally {
    store.close();
  }
});

test("requirement conclusions cannot invent source evidence or claim verification from a model label", () => {
  const path = mkdtempSync(join(tmpdir(), "senslop-intent-"));
  paths.push(path);
  const store = new LocalStore(join(path, "state.sqlite"));
  try {
    const intent = new ReviewIntent(store, "/repo");
    const criterion = {
      id: "null",
      text: "No crash",
      sourceQuote: "No crash",
      checkIds: [],
    };
    const result = intent.validateCoverage(
      {
        criteria: [
          {
            criterionId: "null",
            status: "implemented",
            explanation: "Guard present",
            evidence: [
              {
                path: "guard.ts",
                side: "after",
                start: 1,
                end: 1,
                code: "return input?.value;",
              },
            ],
            questions: [],
          },
        ],
        unexpectedChanges: [],
        limitations: [],
      },
      [criterion],
      { sources: { "guard.ts": "return input?.value;" }, before: {} },
      [],
    );
    expect(result.criteria[0]?.status).toBe("implemented");
    expect(() =>
      intent.validateCoverage(
        {
          ...result,
          criteria: [
            {
              ...result.criteria[0],
              evidence: [
                {
                  path: "guard.ts",
                  side: "after",
                  start: 1,
                  end: 1,
                  code: "invented",
                },
              ],
            },
          ],
        },
        [criterion],
        { sources: { "guard.ts": "return input?.value;" }, before: {} },
        [],
      ),
    ).toThrow(/evidence/);
    expect(() =>
      intent.validateCoverage(
        { ...result, criteria: [] },
        [criterion],
        { sources: {}, before: {} },
        [],
      ),
    ).toThrow(/criterion/);
  } finally {
    store.close();
  }
});

test("nested profiles only affect their subtree and local review overrides take precedence", () => {
  const sources = {
    ".senslop/review.json":
      '{"profiles":["correctness"],"rules":[{"id":"rule","text":"Root"}]}',
    "api/.senslop/review.json":
      '{"profiles":["security"],"rules":[{"id":"rule","text":"Nested"}]}',
  };
  const nested = resolveReviewInstructions(sources);
  expect(applicableReviewProfiles(nested, "web/page.ts")).toEqual([
    "correctness",
  ]);
  expect(applicableReviewProfiles(nested, "api/route.ts")).toEqual([
    "security",
  ]);
  expect(applicableReviewRules(nested, "api/route.ts")[0]?.text).toBe("Nested");
  expect(nested.limitations.join(" ")).toMatch(/overrides.*rule/i);
  expect(
    applicableReviewProfiles(
      resolveReviewInstructions(sources, {}, { profiles: ["performance"] }),
      "api/route.ts",
    ),
  ).toEqual(["performance"]);
});
