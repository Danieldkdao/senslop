import ts from "typescript";
import {
  languageSettingsSchema,
  type LanguageSettingsSchema,
} from "@senslop/contracts";
import { analyzeSemanticSources } from "./language-server";
import { analyzeLanguageSources } from "./language-adapters";
import { cruise } from "dependency-cruiser";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import type {
  Analysis,
  AnalysisContext,
  DependencyEdge,
  SourceMap,
  SourceSymbol,
} from "./types";

import { frozenCompiler } from "./frozen-compiler";

import { snapshotAnalysisVersion } from "./constants";
export { snapshotAnalysisVersion } from "./constants";

const scriptPath = (path: string) => /\.[cm]?[jt]sx?$/.test(path);
const virtualRoot = "/senslop-frozen/";
const validPath = (path: string) =>
  path.length > 0 &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.split("/").some((part) => part === ".." || part === "." || !part);

const components = (edges: DependencyEdge[]) => {
  let index = 0;
  const indices = new Map<string, number>();
  const lows = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const cycles: string[][] = [];
  const visit = (node: string) => {
    indices.set(node, index);
    lows.set(node, index++);
    stack.push(node);
    active.add(node);
    for (const edge of edges.filter(
      (edge) => edge.from === node && edge.provenance !== "unresolved",
    )) {
      if (!indices.has(edge.to)) {
        visit(edge.to);
        lows.set(node, Math.min(lows.get(node)!, lows.get(edge.to)!));
      } else if (active.has(edge.to))
        lows.set(node, Math.min(lows.get(node)!, indices.get(edge.to)!));
    }
    if (lows.get(node) === indices.get(node)) {
      const group: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        active.delete(member);
        group.push(member);
      } while (member !== node);
      if (
        group.length > 1 ||
        edges.some((edge) => edge.from === node && edge.to === node)
      )
        cycles.push(group.sort());
    }
  };
  for (const edge of edges) if (!indices.has(edge.from)) visit(edge.from);
  return cycles;
};

export const analyzeSources = async (
  sources: SourceMap,
  changed: string[],
  languageSettings: LanguageSettingsSchema = languageSettingsSchema.parse({}),
): Promise<Analysis> => {
  if (Object.keys(sources).some((path) => !validPath(path)))
    throw new Error("Invalid frozen source path.");
  const limitations: string[] = [
    "Diagnostics use frozen source and captured project configurations with TypeScript 5.9.3. External dependency declarations and generated project-reference outputs are not captured; dynamic runtime behavior is not verified.",
  ];
  const files = Object.keys(sources).filter(scriptPath);
  const compiler = frozenCompiler(sources, virtualRoot);
  const { host, optionsForFile, configForFile } = compiler;
  const options = optionsForFile(virtualRoot + "index.ts");
  const program = ts.createProgram(
    files.map((path) => virtualRoot + path),
    options,
    host,
  );
  const checker = program.getTypeChecker();
  const edges: DependencyEdge[] = [];
  const symbols: SourceSymbol[] = [];
  const references = new Map<ts.Symbol, { path: string; line: number }[]>();
  const declarations = new Map<SourceSymbol, ts.Symbol>();
  const calls = new Map<ts.Symbol, { path: string; line: number }[]>();
  for (const path of files) {
    const source = program.getSourceFile(virtualRoot + path)!;
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        const resolved = host.resolveModuleNameLiterals?.(
          [node.moduleSpecifier],
          source.fileName,
          undefined,
          optionsForFile(source.fileName),
          source,
          undefined,
        )[0]?.resolvedModule?.resolvedFileName;
        edges.push({
          from: path,
          to: resolved?.startsWith(virtualRoot)
            ? resolved.slice(virtualRoot.length)
            : specifier,
          specifier,
          typeOnly: ts.isImportDeclaration(node)
            ? !!node.importClause?.isTypeOnly
            : node.isTypeOnly,
          provenance: resolved?.startsWith(virtualRoot)
            ? "compiler-resolved"
            : "unresolved",
        });
      }
      if (ts.isIdentifier(node)) {
        let symbol = checker.getSymbolAtLocation(node);
        if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
          symbol = checker.getAliasedSymbol(symbol);
        if (symbol) symbol = checker.getExportSymbolOfSymbol(symbol);
        if (symbol) {
          const rows = references.get(symbol) ?? [];
          if (rows.length < 100)
            rows.push({
              path,
              line:
                source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            });
          references.set(symbol, rows);
          if (
            (ts.isCallExpression(node.parent) &&
              node.parent.expression === node) ||
            (ts.isPropertyAccessExpression(node.parent) &&
              node.parent.name === node &&
              ts.isCallExpression(node.parent.parent) &&
              node.parent.parent.expression === node.parent)
          ) {
            const callers = calls.get(symbol) ?? [];
            callers.push({
              path,
              line:
                source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            });
            calls.set(symbol, callers);
          }
        }
        if (
          node.parent &&
          (ts.isVariableDeclaration(node.parent) ||
            ts.isFunctionDeclaration(node.parent) ||
            ts.isClassDeclaration(node.parent) ||
            ts.isInterfaceDeclaration(node.parent) ||
            ts.isTypeAliasDeclaration(node.parent)) &&
          node.parent.name === node &&
          symbols.length < 10000
        ) {
          symbols.push({
            name: node.text,
            path,
            start:
              source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            end:
              source.getLineAndCharacterOfPosition(node.parent.getEnd()).line +
              1,
            kind: ts.SyntaxKind[node.parent.kind]!,
            type: checker
              .typeToString(checker.getTypeAtLocation(node))
              .slice(0, 1500),
            references: [],
          });
          if (symbol) declarations.set(symbols.at(-1)!, symbol);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const symbol of symbols) {
    const resolved = declarations.get(symbol);
    if (resolved) {
      symbol.references = references.get(resolved) ?? [];
      symbol.callers = calls.get(resolved) ?? [];
      symbol.provenance = "compiler-resolved";
    }
  }
  const projects = new Map<string, string[]>();
  for (const path of files) {
    const key = configForFile(virtualRoot + path);
    const members = projects.get(key) ?? [];
    members.push(path);
    projects.set(key, members);
  }
  const seenDiagnostics = new Set<string>();
  const diagnostics = [...projects.values()]
    .flatMap((members) => {
      if (!members.some((path) => changed.includes(path))) return [];
      const project = ts.createProgram(
        members.map((path) => virtualRoot + path),
        optionsForFile(virtualRoot + members[0]!),
        host,
      );
      return [
        ...project.getSyntacticDiagnostics(),
        ...project.getSemanticDiagnostics(),
      ];
    })
    .filter(
      (item) =>
        item.file?.fileName.startsWith(virtualRoot) &&
        changed.includes(item.file.fileName.slice(virtualRoot.length)),
    )
    .filter((item) => {
      const key = JSON.stringify([
        item.file?.fileName,
        item.start,
        item.code,
        item.category,
        ts.flattenDiagnosticMessageText(item.messageText, " "),
      ]);
      if (seenDiagnostics.has(key)) return false;
      seenDiagnostics.add(key);
      return true;
    })
    .slice(0, 200)
    .map((item) => ({
      path: item.file!.fileName.slice(virtualRoot.length),
      line: item.file!.getLineAndCharacterOfPosition(item.start ?? 0).line + 1,
      code: item.code,
      message: ts.flattenDiagnosticMessageText(item.messageText, " "),
      severity:
        item.category === ts.DiagnosticCategory.Warning
          ? ("warning" as const)
          : ("error" as const),
    }));
  // Cruise only our private frozen copy; never load executable repository configuration.
  const staging = await mkdtemp(join(tmpdir(), "senslop-graph-"));
  try {
    for (const path of files) {
      await mkdir(dirname(join(staging, path)), { recursive: true });
      await writeFile(join(staging, path), sources[path]!, { mode: 0o600 });
    }
    const result = await cruise(
      files.map((path) => join(staging, path)),
      {
        baseDir: staging,
        outputType: "json",
        doNotFollow: { path: "node_modules" },
        tsPreCompilationDeps: true,
        maxDepth: 2,
      },
      {},
      { tsConfig: { options: { baseUrl: staging } } },
    );
    if (typeof result.output !== "string") {
      for (const entry of result.output.modules)
        for (const dependency of entry.dependencies) {
          const from = entry.source.replace(staging + "/", "");
          const to = dependency.resolved.replace(staging + "/", "");
          if (
            sources[from] !== undefined &&
            sources[to] !== undefined &&
            !edges.some((edge) => edge.from === from && edge.to === to)
          )
            edges.push({
              from,
              to,
              specifier: dependency.module,
              typeOnly: dependency.dependencyTypes.includes("type-only"),
              provenance: "syntactic",
            });
        }
    }
  } catch {
    limitations.push(
      "Supplemental dependency-cruiser extraction was unavailable; compiler import edges remain available.",
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  const additional = await analyzeLanguageSources(sources);
  edges.push(...additional.edges);
  symbols.push(...additional.symbols);
  diagnostics.push(...additional.diagnostics);
  limitations.push(...additional.limitations);
  const capabilities = additional.capabilities;
  const semantic = await analyzeSemanticSources(sources, languageSettings);
  const resolvedPaths = new Set(Object.keys(semantic.capabilities));
  for (let index = symbols.length - 1; index >= 0; index--)
    if (resolvedPaths.has(symbols[index]!.path)) symbols.splice(index, 1);
  symbols.push(
    ...semantic.symbols.filter((symbol) => resolvedPaths.has(symbol.path)),
  );
  diagnostics.push(...semantic.diagnostics);
  Object.assign(capabilities, semantic.capabilities);
  limitations.push(...semantic.limitations);
  for (const path of files)
    capabilities[path] = {
      language:
        path.endsWith(".ts") || path.endsWith(".tsx")
          ? "TypeScript"
          : "JavaScript",
      level: "semantic",
      tool: "TypeScript 5.9.3",
      limitations: [...compiler.limitations],
    };
  const textOnly = changed.filter(
    (path) => !scriptPath(path) && capabilities[path]?.level === "text",
  );
  if (textOnly.length)
    limitations.push(
      `Unsupported files receive text-only review, without semantic diagnostics (${textOnly.length} files).`,
    );
  limitations.push(...compiler.limitations);
  return {
    capabilities,
    version: snapshotAnalysisVersion,
    edges,
    symbols,
    diagnostics,
    cycles: components(edges),
    limitations,
  };
};

export const sourceTools = (context: AnalysisContext) => {
  const { sources, analysis } = context;
  return {
    list: (query = "") =>
      Object.keys(sources)
        .filter((path) => path.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 200),
    read: (
      path: string,
      start = 1,
      end = start + 100,
      side: "before" | "after" = "after",
    ) => {
      if (!validPath(path)) throw new Error("Invalid snapshot path.");
      const text = (side === "before" ? (context.before ?? sources) : sources)[
        path
      ];
      if (text === undefined)
        throw new Error("Source is unavailable in the frozen context.");
      if (start < 1 || end < start || end - start > 200)
        throw new Error("Read at most 201 lines per request.");
      return text
        .split("\n")
        .slice(start - 1, end)
        .map((line, offset) => `${start + offset}: ${line}`)
        .join("\n")
        .slice(0, 24000);
    },
    search: (query: string) => {
      if (!query.trim()) return [];
      const matches: { path: string; line: number; code: string }[] = [];
      for (const [path, text] of Object.entries(sources)) {
        for (const [index, line] of text.split("\n").entries()) {
          if (line.includes(query))
            matches.push({ path, line: index + 1, code: line.slice(0, 500) });
          if (matches.length >= 50) return matches;
        }
      }
      return matches;
    },
    symbols: (query: string) =>
      analysis.symbols
        .filter((symbol) => symbol.name.includes(query))
        .slice(0, 30),
    references: (name: string) =>
      analysis.symbols
        .filter((symbol) => symbol.name === name)
        .flatMap((symbol) => symbol.references)
        .slice(0, 100),
    dependencies: (path: string) => ({
      dependencies: analysis.edges
        .filter((edge) => edge.from === path)
        .slice(0, 100),
      dependents: analysis.edges
        .filter((edge) => edge.to === path)
        .slice(0, 100),
    }),
    relatedTests: (path: string) =>
      Object.keys(sources)
        .filter(
          (file) =>
            /(?:test|spec)[./]/.test(file) &&
            (analysis.edges.some(
              (edge) => edge.from === file && edge.to === path,
            ) ||
              posix
                .basename(file)
                .startsWith(posix.basename(path).split(".")[0]!)),
        )
        .slice(0, 30),
  };
};
