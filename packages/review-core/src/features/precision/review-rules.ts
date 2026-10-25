import { posix, matchesGlob } from "node:path";
import {
  reviewRulesSchema,
  reviewRulesPatchSchema,
  type ReviewInstructionsSchema,
  type ReviewRulesPatchSchema,
  type ReviewProfile,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import {
  allowsSourcePath,
  projectPreferenceKey,
  readProjectPolicy,
} from "../workflow/project-policy";

export const resolveReviewInstructions = (
  sources: Record<string, string>,
  project: ReviewRulesPatchSchema = {},
  review: ReviewRulesPatchSchema = {},
): ReviewInstructionsSchema => {
  const result: ReviewInstructionsSchema = {
    profiles: ["correctness"],
    rules: [],
    sources: [],
    profileScopes: [],
    limitations: [],
  };
  let precedence = 0;
  const configs = Object.keys(sources)
    .filter(
      (path) =>
        path === ".senslop/review.json" ||
        path.endsWith("/.senslop/review.json"),
    )
    .sort(
      (left, right) =>
        left.split("/").length - right.split("/").length ||
        left.localeCompare(right),
    );
  const apply = (input: unknown, source: string, scope: string) => {
    precedence++;
    const parsed = reviewRulesPatchSchema.safeParse(input);
    if (!parsed.success) {
      result.limitations.push(
        `${source}: invalid review configuration: ${parsed.error.message}`,
      );
      return;
    }
    if (input && typeof input === "object")
      for (const key of Object.keys(input))
        if (!(key in reviewRulesSchema.shape))
          result.limitations.push(
            `${source}: unknown configuration field ${key}.`,
          );
    const config = parsed.data;
    if (config.profiles) {
      result.profileScopes!.push({
        scope,
        source,
        profiles: [...new Set(config.profiles)],
        precedence,
      });
      result.profiles = scope
        ? [...new Set([...result.profiles, ...config.profiles])]
        : [...new Set(config.profiles)];
    }
    for (const rule of config.rules ?? []) {
      const overridden = result.rules
        .filter(
          (candidate) =>
            candidate.id === rule.id && scope.startsWith(candidate.scope),
        )
        .at(-1);
      if (
        overridden &&
        (overridden.text !== rule.text || overridden.enabled !== rule.enabled)
      )
        result.limitations.push(
          `${source} overrides rule ${rule.id} from ${overridden.source} within ${scope || "the project"}. Inspect both sources if their requirements conflict.`,
        );
      result.rules.push({ ...rule, source, scope, precedence });
    }
    for (const path of config.instructionFiles ?? []) {
      const resolved = posix.normalize(posix.join(scope, path));
      if (!resolved.startsWith("../") && sources[resolved] !== undefined) {
        result.sources.push({
          path: resolved,
          contents: sources[resolved]!,
          scope,
        });
        result.rules.push({
          id: `document:${resolved}`,
          text: sources[resolved]!.slice(0, 30000),
          paths: ["**/*"],
          enabled: true,
          source: resolved,
          scope,
          precedence,
        });
      } else
        result.limitations.push(
          `${source}: instruction source ${path} is unavailable in frozen context.`,
        );
    }
    for (const id of config.selectedCustomProfiles ?? []) {
      const custom = config.customProfiles?.find((item) => item.id === id);
      if (!custom) {
        result.limitations.push(
          `${source}: custom profile ${id} is unavailable.`,
        );
        continue;
      }
      const base = applicableReviewProfiles(result, scope);
      result.profileScopes!.push({
        scope,
        source,
        profiles: [...new Set([...base, ...custom.profiles])],
        precedence,
      });
      result.profiles = [...new Set([...result.profiles, ...custom.profiles])];
      if (custom.instructions.trim())
        result.rules.push({
          id: `profile:${id}`,
          text: custom.instructions,
          paths: ["**/*"],
          enabled: true,
          source,
          scope,
          precedence,
        });
    }
  };
  for (const path of configs) {
    try {
      result.sources.push({
        path,
        contents: sources[path]!,
        scope: path.slice(0, -".senslop/review.json".length),
      });
      apply(
        JSON.parse(sources[path]!),
        path,
        path.slice(0, -".senslop/review.json".length),
      );
    } catch {
      result.limitations.push(`${path}: configuration is not valid JSON.`);
    }
  }
  apply(project, "Local project overrides", "");
  apply(review, "This review", "");
  return result;
};

export const applicableReviewProfiles = (
  instructions: ReviewInstructionsSchema,
  path: string,
): ReviewProfile[] => {
  let profiles: ReviewProfile[] = instructions.profileScopes
    ? ["correctness"]
    : instructions.profiles;
  for (const selection of instructions.profileScopes ?? [])
    if (path.startsWith(selection.scope)) profiles = selection.profiles;
  return profiles;
};

export const applicableReviewRules = (
  instructions: ReviewInstructionsSchema,
  path: string,
) => {
  const rules = new Map<string, ReviewInstructionsSchema["rules"][number]>();
  for (const rule of instructions.rules)
    if (
      path.startsWith(rule.scope) &&
      rule.paths.some((pattern) =>
        matchesGlob(path.slice(rule.scope.length), pattern),
      )
    )
      rules.set(rule.id, rule);
  return [...rules.values()].filter((rule) => rule.enabled);
};

export const profileInstructions = (profile: ReviewProfile): string => {
  switch (profile) {
    case "correctness":
      return "Check concrete functional failures, edge cases, state transitions and error handling.";
    case "security":
      return "Check trust boundaries, authorization, injection, secret exposure and unsafe input handling.";
    case "performance":
      return "Check evidence-backed avoidable work, scaling regressions, resource leaks and expensive operations.";
    case "accessibility":
      return "Check semantic controls, keyboard access, focus behavior, accessible names and state announcements.";
    case "api-compatibility":
      return "Check exported contracts, request and response shapes, callers, and backward compatibility.";
    case "migrations":
      return "Check persistence changes, data compatibility, migration ordering, rollback and old-record handling.";
  }
};

export const readReviewOverrides = (
  store: LocalStore,
  repository: string,
  reviewId?: string,
): ReviewRulesPatchSchema => {
  const key = reviewId
    ? `review_rules:${reviewId}`
    : projectPreferenceKey(store, repository, "review_rules");
  const row = store.database
    .prepare("SELECT value FROM preferences WHERE name=?")
    .get(key);
  return reviewRulesPatchSchema.parse(row ? JSON.parse(String(row.value)) : {});
};

export const saveReviewOverrides = (
  store: LocalStore,
  repository: string,
  input: ReviewRulesPatchSchema,
  reviewId?: string,
) => {
  if (reviewId && !store.getReview(repository, reviewId))
    throw new Error("Review not found.");
  const value = reviewRulesPatchSchema.parse(input);
  const key = reviewId
    ? `review_rules:${reviewId}`
    : projectPreferenceKey(store, repository, "review_rules");
  store.database
    .prepare(
      "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    )
    .run(key, JSON.stringify(value));
  return value;
};

export const readReviewInstructions = (
  store: LocalStore,
  repository: string,
  reviewId: string,
  overrides?: {
    project?: ReviewRulesPatchSchema;
    review?: ReviewRulesPatchSchema;
  },
) => {
  const review = store.getReview(repository, reviewId);
  if (!review) throw new Error("Review not found.");
  const policy = readProjectPolicy(store, repository);
  const row = store.database
    .prepare("SELECT body FROM ai_context WHERE snapshot_id=?")
    .get(reviewId);
  const context = row
    ? (JSON.parse(String(row.body)) as {
        hash?: string;
        sources?: Record<string, string>;
      })
    : null;
  const sources = context?.hash === review.hash ? (context.sources ?? {}) : {};
  const allowed = Object.fromEntries(
    Object.entries(sources).filter(([path]) => allowsSourcePath(policy, path)),
  );
  for (const file of review.files)
    if (file.after !== null && allowsSourcePath(policy, file.path))
      allowed[file.path] = file.after;
  return resolveReviewInstructions(
    allowed,
    overrides?.project ?? readReviewOverrides(store, repository),
    overrides?.review ?? readReviewOverrides(store, repository, reviewId),
  );
};
