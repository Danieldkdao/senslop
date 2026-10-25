import { resolveRepository } from "@senslop/review-core/git";
import { applicationDataDirectory } from "./runtime-paths.js";
import { readWorkspaceSession } from "./workspace-session.js";
import { requestJSON } from "../../lib/http.js";
import { resolve } from "node:path";
import { CliError } from "../commands/errors.js";

export const connectWorkspace = async (
  repository = process.cwd(),
  dataDirectory = applicationDataDirectory(),
) => {
  const root = await resolveRepository(repository);
  const unavailable = () =>
    new Error(
      "No matching local app is running. In a separate terminal, run senslop app start in this repository.",
    );
  const session = await readWorkspaceSession(dataDirectory, root).catch(() => {
    throw unavailable();
  });
  const health = await fetch(`${session.origin}/api/health`, {
    headers: { Authorization: `Bearer ${session.token}` },
    redirect: "error",
    signal: AbortSignal.timeout(2000),
  }).catch(() => null);
  if (!health?.ok || health.headers.get("X-Senslop-Session") !== session.token)
    throw unavailable();
  await health.body?.cancel();
  return {
    info: () => ({
      repository: root,
      directory: resolve(repository),
      origin: session.origin,
      pid: session.pid,
    }),
    browserUrl: (reviewId?: string, path?: string) =>
      `${session.origin}/api/session?token=${session.token}${reviewId ? `&review=${encodeURIComponent(reviewId)}` : ""}${path ? `&file=${encodeURIComponent(path)}` : ""}`,
    request: async <T = unknown>(
      path: string,
      body?: object,
      method = body ? "POST" : "GET",
      signal?: AbortSignal,
    ): Promise<T> => {
      if (!path.startsWith("/api/") || path.includes("#"))
        throw new Error("Use a local API path.");
      try {
        return await requestJSON<T>(
          session.origin,
          path,
          {
            method,
            body: body ? JSON.stringify(body) : undefined,
            signal: signal ?? AbortSignal.timeout(120000),
          },
          session.token,
        );
      } catch (error) {
        if (
          (error as { status?: number }).status === 409 &&
          /Review contents changed|changed during/.test(
            (error as Error).message,
          )
        )
          throw new CliError((error as Error).message, "review_conflict", 6);
        throw error;
      }
    },
  };
};

export type WorkspaceClient = Awaited<ReturnType<typeof connectWorkspace>>;
