import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { CatalogModelSchema } from "../../features/providers/model-schemas";
import { claudeSubscriptionEnvironment } from "../../data/env/server";
import { formatSubscriptionRequirements } from "../../features/providers/lib/formatters";

export const resolveClaudeExecutable = () => {
  // Resolve at runtime: Turbopack rewrites literal require.resolve calls to module IDs.
  const resolve = createRequire(import.meta.url).resolve;
  const sdk = createRequire(
    resolve.call(null, "@anthropic-ai/claude-agent-sdk"),
  );
  const report =
    process.platform === "linux" ? process.report.getReport() : null;
  const musl =
    report &&
    typeof report === "object" &&
    !(report as { header: { glibcVersionRuntime?: string } }).header
      .glibcVersionRuntime;
  const platform = `${process.platform}-${process.arch}${musl ? "-musl" : ""}`;
  const packagePath = sdk.resolve(
    `@anthropic-ai/claude-agent-sdk-${platform}/package.json`,
  );
  return join(
    dirname(packagePath),
    process.platform === "win32" ? "claude.exe" : "claude",
  );
};

const runClaudeCommand = async (args: string[], signal: AbortSignal) => {
  const { stdout } = await promisify(execFile)(
    resolveClaudeExecutable(),
    args,
    {
      signal,
      timeout: args[1] === "login" ? 600000 : 15000,
      maxBuffer: 1024 * 1024,
      cwd: tmpdir(),
      env: claudeSubscriptionEnvironment(),
      windowsHide: true,
      encoding: "utf8",
    },
  );
  return stdout;
};

const readClaudeModels = async (
  signal: AbortSignal,
): Promise<CatalogModelSchema[]> => {
  const abort = new AbortController();
  const stop = () => abort.abort();
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  const timer = setTimeout(stop, 20000);
  const input = async function* () {
    await new Promise<void>((resolve) => {
      if (abort.signal.aborted) resolve();
      else
        abort.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  };
  const session = query({
    prompt: input(),
    options: {
      abortController: abort,
      cwd: tmpdir(),
      env: claudeSubscriptionEnvironment(),
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      persistSession: false,
      pathToClaudeCodeExecutable: resolveClaudeExecutable(),
    },
  });
  try {
    const models = await session.supportedModels();
    return models.map((model) => ({
      id: model.value,
      name: model.displayName,
      available: true,
      ...(model.resolvedModel ? { aliases: [model.resolvedModel] } : {}),
    }));
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    abort.abort();
    session.close();
  }
};

export const createClaudeSubscriptionDriver = ({
  command = runClaudeCommand,
  metadata = readClaudeModels,
}: {
  command?: (args: string[], signal: AbortSignal) => Promise<string>;
  metadata?: (signal: AbortSignal) => Promise<CatalogModelSchema[]>;
} = {}) => {
  const account = async (signal: AbortSignal) => {
    const result = z
      .object({
        loggedIn: z.boolean(),
        authMethod: z.string(),
        email: z.email(),
        subscriptionType: z.string().nullable().optional(),
      })
      .safeParse(JSON.parse(await command(["auth", "status"], signal)));
    if (
      !result.success ||
      !result.data.loggedIn ||
      result.data.authMethod !== "claude.ai" ||
      result.data.subscriptionType === "free"
    )
      throw new Error(
        `Claude Code account access could not be verified. ${formatSubscriptionRequirements("claude-code")} Sign in with an eligible Claude account.`,
      );
    return {
      email: result.data.email,
      subject: result.data.email,
      plan: result.data.subscriptionType ?? null,
    };
  };
  return {
    account,
    signIn: async (signal: AbortSignal) => {
      await command(["auth", "login"], signal);
      return account(signal);
    },
    models: metadata,
  };
};
