import { createHash } from "node:crypto";
import { matchesGlob } from "node:path";
import {
  projectPolicySchema,
  isLocalEndpoint,
  type ProjectPolicySchema,
} from "@senslop/contracts";
import { secretReason } from "../git/snapshot";
import type { LocalStore } from "../../db/local-store";

export class WorkflowPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowPolicyError";
  }
}

export const projectPreferenceKey = (
  store: LocalStore,
  repository: string,
  name: string,
) => {
  const common = store.database
    .prepare("SELECT value FROM preferences WHERE name=?")
    .get(`project_common:${repository}`);
  return `${name}:${common ? String(common.value) : repository}`;
};

export const readProjectPolicy = (
  store: LocalStore,
  repository: string,
): ProjectPolicySchema => {
  const row = store.database
    .prepare("SELECT value FROM preferences WHERE name = ?")
    .get(projectPreferenceKey(store, repository, "project_policy"));
  return projectPolicySchema.parse(row ? JSON.parse(String(row.value)) : {});
};
export const saveProjectPolicy = (
  store: LocalStore,
  repository: string,
  input: ProjectPolicySchema,
) => {
  const policy = projectPolicySchema.parse(input);
  store.database
    .prepare(
      "INSERT INTO preferences VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
    )
    .run(
      projectPreferenceKey(store, repository, "project_policy"),
      JSON.stringify(policy),
    );
  return policy;
};

export const readReviewPolicy = (
  store: LocalStore,
  repository: string,
  reviewId: string,
) => {
  const policy = readProjectPolicy(store, repository);
  const row = store.database
    .prepare("SELECT value FROM preferences WHERE name=?")
    .get(`review_limits:${reviewId}`);
  if (!row || !store.getReview(repository, reviewId)) return policy;
  const limits = projectPolicySchema
    .pick({ mode: true, tokenBudget: true, timeLimitSeconds: true })
    .parse(JSON.parse(String(row.value)));
  return { ...policy, ...limits };
};

export const saveReviewLimits = (
  store: LocalStore,
  repository: string,
  reviewId: string,
  input: Pick<ProjectPolicySchema, "mode" | "tokenBudget" | "timeLimitSeconds">,
) => {
  if (!store.getReview(repository, reviewId))
    throw new Error("Review not found.");
  const limits = projectPolicySchema
    .pick({ mode: true, tokenBudget: true, timeLimitSeconds: true })
    .parse(input);
  store.database
    .prepare(
      "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    )
    .run(`review_limits:${reviewId}`, JSON.stringify(limits));
  return limits;
};
export const sourcePolicyHash = (policy: ProjectPolicySchema) =>
  createHash("sha256")
    .update(
      JSON.stringify({ include: policy.include, exclude: policy.exclude }),
    )
    .digest("hex");
export const allowsSourcePath = (policy: ProjectPolicySchema, path: string) => {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === ".." || part === "." || !part) ||
    secretReason(path)
  )
    return false;
  const matches = (pattern: string) =>
    matchesGlob(path, pattern) ||
    path === pattern.replace(/\/$/, "") ||
    path.startsWith(`${pattern.replace(/\/$/, "")}/`);
  return (
    (!policy.include.length || policy.include.some(matches)) &&
    !policy.exclude.some(matches)
  );
};
export const assertInferenceRoute = (
  policy: ProjectPolicySchema,
  connection: { provider: string; baseURL: string },
) => {
  if (
    policy.inference === "local-only" &&
    (!isLocalEndpoint(connection.baseURL) ||
      ["chatgpt-subscription", "claude-code"].includes(connection.provider))
  )
    throw new WorkflowPolicyError(
      "This project's local-only policy blocks the selected model route. Choose a local endpoint.",
    );
};
