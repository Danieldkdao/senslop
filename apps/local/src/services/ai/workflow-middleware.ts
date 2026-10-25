import type { LanguageModelMiddleware } from "ai";
import type { LocalStore } from "@senslop/review-core/storage";
import { UsageStore } from "@senslop/review-core/usage";
import {
  readProjectPolicy,
  assertInferenceRoute,
  allowsSourcePath,
  sourcePolicyHash,
  WorkflowPolicyError,
} from "@senslop/review-core/policy";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { estimateInputTokenUpperBound } from "./context-budget";

export type ModelWorkflowScope = {
  store: LocalStore;
  repository: string;
  review: ReviewIdentitySchema;
  task: string;
  sourcePaths?: string[];
  policyHash?: string;
};
export const createWorkflowMiddleware = (
  scope: ModelWorkflowScope,
  connection: { provider: string; baseURL: string },
  model: string,
): LanguageModelMiddleware => {
  const initialPolicyHash =
    scope.policyHash ??
    sourcePolicyHash(readProjectPolicy(scope.store, scope.repository));
  const begin = (
    params: Parameters<
      NonNullable<LanguageModelMiddleware["wrapGenerate"]>
    >[0]["params"],
  ) => {
    const policy = readProjectPolicy(scope.store, scope.repository);
    assertInferenceRoute(policy, connection);
    const snapshot = scope.store.getReview(scope.repository, scope.review.id);
    if (
      !snapshot ||
      sourcePolicyHash(policy) !== initialPolicyHash ||
      (scope.sourcePaths ?? []).some(
        (path) => !allowsSourcePath(policy, path),
      ) ||
      snapshot.files.some(
        (file) =>
          !allowsSourcePath(policy, file.path) ||
          (file.oldPath && !allowsSourcePath(policy, file.oldPath)),
      )
    )
      throw new WorkflowPolicyError(
        "Source policy blocks this review. Capture a new review before requesting analysis.",
      );
    const estimate =
      estimateInputTokenUpperBound({
        prompt: params.prompt,
        tools: params.tools,
        responseFormat: params.responseFormat,
      }) + (params.maxOutputTokens ?? 0);
    const lease = new UsageStore(scope.store, scope.repository).reserve(
      scope.review,
      scope.task,
      estimate,
      { provider: connection.provider, model },
    );
    if (lease.signal)
      params.abortSignal = AbortSignal.any([
        ...(params.abortSignal ? [params.abortSignal] : []),
        lease.signal,
      ]);
    return lease;
  };
  return {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params }) => {
      const lease = begin(params);
      try {
        const result = await doGenerate();
        lease.finish({
          inputTokens: result.usage.inputTokens.total,
          outputTokens: result.usage.outputTokens.total,
        });
        return result;
      } catch (error) {
        lease.finish({});
        throw error;
      }
    },
    wrapStream: async ({ doStream, params }) => {
      const lease = begin(params);
      try {
        const result = await doStream();
        const reader = result.stream.getReader();
        let usage: { inputTokens?: number; outputTokens?: number } = {};
        return {
          ...result,
          stream: new ReadableStream({
            async pull(controller) {
              try {
                const part = await reader.read();
                if (part.done) {
                  lease.finish(usage);
                  controller.close();
                  return;
                }
                if (part.value.type === "finish")
                  usage = {
                    inputTokens: part.value.usage.inputTokens.total,
                    outputTokens: part.value.usage.outputTokens.total,
                  };
                controller.enqueue(part.value);
              } catch (error) {
                lease.finish(usage);
                controller.error(error);
              }
            },
            async cancel(reason) {
              lease.finish(usage);
              await reader.cancel(reason);
            },
          }),
        };
      } catch (error) {
        lease.finish({});
        throw error;
      }
    },
  };
};
