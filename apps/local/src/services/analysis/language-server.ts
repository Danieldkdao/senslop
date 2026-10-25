import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { z } from "zod";
import type {
  LanguageSettingsSchema,
  LanguageCapabilitySchema,
  LanguageToolSchema,
} from "@senslop/contracts";
import { analysisToolEnvironment } from "../../data/env/server";
import type { SourceMap, SourceSymbol, SourceDiagnostic } from "./types";

const lspPositionSchema = z.object({
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});
type LspPositionSchema = z.infer<typeof lspPositionSchema>;
const lspRangeSchema = z.object({
  start: lspPositionSchema,
  end: lspPositionSchema,
});
type LspRangeSchema = z.infer<typeof lspRangeSchema>;
const lspLocationSchema = z.object({ uri: z.string(), range: lspRangeSchema });
type LspLocationSchema = z.infer<typeof lspLocationSchema>;

const languageServer = (
  tool: LanguageToolSchema,
  directory: string,
  signal: AbortSignal,
  onDiagnostics: (params: unknown) => void,
) => {
  const child = spawn(tool.command, tool.args, {
    cwd: directory,
    env: analysisToolEnvironment(directory),
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let sequence = 0;
  let buffer = Buffer.alloc(0);
  let failure: Error | null = null;
  const pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  const send = (value: unknown) => {
    const body = JSON.stringify(value);
    child.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  };
  const fail = (error: Error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("exit", () =>
    fail(new Error("Language server exited before analysis completed.")),
  );
  child.stderr.resume();
  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 8 * 1024 * 1024) {
      fail(new Error("Language server response exceeded its limit."));
      child.kill();
      return;
    }
    for (;;) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) break;
      const length = Number(
        /Content-Length:\s*(\d+)/i.exec(
          buffer.subarray(0, end).toString(),
        )?.[1],
      );
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > 8 * 1024 * 1024
      ) {
        fail(new Error("Invalid language server framing."));
        child.kill();
        return;
      }
      if (buffer.length < end + 4 + length) break;
      try {
        const message = JSON.parse(
          buffer.subarray(end + 4, end + 4 + length).toString(),
        );
        buffer = buffer.subarray(end + 4 + length);
        if (typeof message.method === "string") {
          if (message.method === "textDocument/publishDiagnostics")
            onDiagnostics(message.params);
          if (message.id !== undefined)
            send({
              jsonrpc: "2.0",
              id: message.id,
              result:
                message.method === "workspace/configuration"
                  ? (message.params?.items ?? []).map(() => ({}))
                  : null,
            });
        } else if (pending.has(message.id)) {
          const entry = pending.get(message.id)!;
          pending.delete(message.id);
          if (message.error)
            entry.reject(new Error(String(message.error.message)));
          else entry.resolve(message.result);
        }
      } catch (error) {
        fail(error as Error);
        break;
      }
    }
  });
  const stop = () => {
    try {
      if (child.pid && process.platform !== "win32")
        process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {}
    fail(new Error("Language analysis stopped."));
  };
  signal.addEventListener("abort", stop, { once: true });
  return {
    notify: (method: string, params: unknown) =>
      send({ jsonrpc: "2.0", method, params }),
    request: (method: string, params: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        if (failure || signal.aborted) {
          reject(failure ?? new Error("Language analysis stopped."));
          return;
        }
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        send({ jsonrpc: "2.0", id, method, params });
      }),
    close: async () => {
      signal.removeEventListener("abort", stop);
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise<void>((resolve) =>
          child.once("close", () => resolve()),
        );
        stop();
        await closed;
      }
    },
  };
};

export const analyzeSemanticSources = async (
  sources: SourceMap,
  settings: LanguageSettingsSchema,
  signal?: AbortSignal,
) => {
  const symbols: SourceSymbol[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  const capabilities: Record<string, LanguageCapabilitySchema> = {};
  const limitations: string[] = [];
  for (const language of ["python", "go"] as const) {
    const tool = settings[language];
    const paths = Object.keys(sources).filter((path) =>
      path.endsWith(language === "python" ? ".py" : ".go"),
    );
    if (!tool.enabled || !paths.length) continue;
    const directory = await mkdtemp(join(tmpdir(), "senslop-language-"));
    const timeout = AbortSignal.timeout(30000);
    const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const sourcePath = (uri: string) => {
      try {
        const path = relative(directory, fileURLToPath(uri)).replaceAll(
          "\\",
          "/",
        );
        return !path.startsWith("../") && !isAbsolute(path) && path in sources
          ? path
          : null;
      } catch {
        return null;
      }
    };
    let server: ReturnType<typeof languageServer> | null = null;
    try {
      for (const [path, contents] of Object.entries(sources)) {
        if (
          isAbsolute(path) ||
          path
            .split(/[\\/]/)
            .some((part) => part === ".." || part === "." || !part)
        )
          throw new Error("Invalid frozen source path.");
        const target = join(directory, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, contents);
      }
      server = languageServer(tool, directory, abort, (params) => {
        const parsed = z
          .object({
            uri: z.string(),
            diagnostics: z.array(
              z.object({
                range: lspRangeSchema,
                message: z.string(),
                severity: z.number().optional(),
                code: z.union([z.number(), z.string()]).optional(),
              }),
            ),
          })
          .safeParse(params);
        if (!parsed.success) return;
        const path = sourcePath(parsed.data.uri);
        if (path)
          for (const item of parsed.data.diagnostics.slice(0, 100))
            diagnostics.push({
              path,
              line: item.range.start.line + 1,
              code: typeof item.code === "number" ? item.code : 0,
              message: item.message,
              severity: item.severity === 1 ? "error" : "warning",
            });
      });
      const initialized = await server.request("initialize", {
        processId: process.pid,
        rootUri: pathToFileURL(directory).href,
        workspaceFolders: [
          { uri: pathToFileURL(directory).href, name: "Frozen review" },
        ],
        capabilities: {
          textDocument: {
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            references: {},
            callHierarchy: {},
          },
          workspace: { configuration: true },
        },
      });
      const info = z
        .object({
          serverInfo: z
            .object({ name: z.string(), version: z.string().optional() })
            .optional(),
        })
        .parse(initialized);
      server.notify("initialized", {});
      const resolveLocation = (location: LspLocationSchema) => {
        const path = sourcePath(location.uri);
        return path ? { path, line: location.range.start.line + 1 } : null;
      };
      for (const path of paths.slice(0, 100)) {
        const uri = pathToFileURL(join(directory, path)).href;
        server.notify("textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: language,
            version: 1,
            text: sources[path],
          },
        });
        const output = await server.request("textDocument/documentSymbol", {
          textDocument: { uri },
        });
        const visit = async (input: unknown): Promise<void> => {
          const parsed = z
            .object({
              name: z.string(),
              kind: z.number(),
              range: lspRangeSchema.optional(),
              selectionRange: lspRangeSchema.optional(),
              location: lspLocationSchema.optional(),
              children: z.array(z.unknown()).optional(),
            })
            .safeParse(input);
          if (!parsed.success || symbols.length >= 300) return;
          const item = parsed.data;
          const range: LspRangeSchema | undefined =
            item.range ?? item.location?.range;
          if (!range) return;
          const position: LspPositionSchema = (item.selectionRange ?? range)
            .start;
          const references = z
            .array(lspLocationSchema)
            .nullable()
            .parse(
              await server!.request("textDocument/references", {
                textDocument: { uri },
                position,
                context: { includeDeclaration: false },
              }),
            );
          const symbol: SourceSymbol = {
            name: item.name,
            path,
            start: range.start.line + 1,
            end: range.end.line + 1,
            kind: String(item.kind),
            type: "",
            provenance: "compiler-resolved",
            references: (references ?? []).flatMap(
              (location) => resolveLocation(location) ?? [],
            ),
          };
          symbols.push(symbol);
          for (const child of item.children ?? []) await visit(child);
        };
        if (Array.isArray(output)) for (const item of output) await visit(item);
        capabilities[path] = {
          language: language === "python" ? "Python" : "Go",
          level: "semantic",
          tool: `${info.serverInfo?.name ?? tool.command} ${info.serverInfo?.version ?? "version unreported"}`,
          limitations: [
            "Resolution is limited to captured source and the configured tool environment. External dependency source is not captured.",
          ],
        };
      }
      if (paths.length > 100)
        limitations.push(
          `${language}: semantic indexing reached its 100-file limit; remaining files retain parsing support.`,
        );
    } catch (error) {
      limitations.push(
        `${language}: semantic tooling unavailable or incomplete: ${(error as Error).message}`,
      );
    } finally {
      await server?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
  return { symbols, diagnostics, capabilities, limitations };
};
