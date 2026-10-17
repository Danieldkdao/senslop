import ts from "typescript";
import { dirname, posix } from "node:path";
import { frozenPackages } from "./frozen-packages";
import type { SourceMap } from "./types";

export const frozenCompiler = (sources: SourceMap, root: string) => {
  const defaults: ts.CompilerOptions = {
    noEmit: true,
    allowJs: true,
    checkJs: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
  };
  const bundled = ts.createCompilerHost(defaults);
  const libraryRoot = dirname(ts.getDefaultLibFilePath(defaults));
  const limitations = new Set<string>();
  const read = (path: string) =>
    path.startsWith(root)
      ? sources[path.slice(root.length)]
      : path.startsWith(`${libraryRoot}/`) && /lib\..*\.d\.ts$/.test(path)
        ? bundled.readFile(path)
        : undefined;
  const resolveWorkspace = frozenPackages(sources, root);
  const paths = Object.keys(sources).map((path) => root + path);
  const directoryExists = (path: string) =>
    paths.some((file) => file.startsWith(`${path.replace(/\/$/, "")}/`));
  const configForFile = (file: string) => {
    for (
      let directory = posix.dirname(file);
      directory.startsWith(root.slice(0, -1));
      directory = posix.dirname(directory)
    ) {
      for (const name of ["tsconfig.json", "jsconfig.json"]) {
        const path = posix.join(directory, name);
        if (sources[path.slice(root.length)] !== undefined) return path;
      }
      if (directory === root.slice(0, -1)) break;
    }
    return "";
  };
  const configurations = new Map<string, ts.CompilerOptions>();
  const optionsForFile = (file: string): ts.CompilerOptions => {
    const config = configForFile(file);
    if (!config) return defaults;
    const cached = configurations.get(config);
    if (cached) return cached;
    const parsed = ts.getParsedCommandLineOfConfigFile(
      config,
      {},
      {
        useCaseSensitiveFileNames: true,
        getCurrentDirectory: () => root,
        readFile: read,
        fileExists: (path) => read(path) !== undefined,
        readDirectory: (directory, extensions) =>
          paths.filter(
            (path) =>
              path.startsWith(directory.replace(/\/$/, "") + "/") &&
              (!extensions ||
                extensions.some((extension) => path.endsWith(extension))),
          ),
        onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
          limitations.add(
            `${config.slice(root.length)}: captured TypeScript configuration could not be loaded: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
          ),
      },
    );
    for (const error of parsed?.errors ?? []) {
      if (error.code === 18003) continue;
      limitations.add(
        `${config.slice(root.length)}: captured TypeScript configuration is incomplete: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
      );
    }
    const options = {
      ...defaults,
      ...parsed?.options,
      noEmit: true,
      skipLibCheck: true,
    };
    configurations.set(config, options);
    return options;
  };
  const host: ts.CompilerHost = {
    ...bundled,
    getCurrentDirectory: () => root,
    readFile: read,
    fileExists: (path) => read(path) !== undefined,
    directoryExists,
    getDirectories: () => [],
    realpath: (path) => path,
    getSourceFile: (path, languageVersion) => {
      const text = read(path);
      return text === undefined
        ? undefined
        : ts.createSourceFile(path, text, languageVersion, true);
    },
    // Imported workspace files resolve their own aliases, even across project boundaries.
    resolveModuleNameLiterals: (
      literals,
      containingFile,
      redirectedReference,
      _options,
      containingSourceFile,
    ) =>
      literals.map((literal) => {
        const options = optionsForFile(containingFile);
        const mode = ts.getModeForUsageLocation(
          containingSourceFile,
          literal,
          options,
        );
        const resolved = ts.resolveModuleName(
          literal.text,
          containingFile,
          options,
          host,
          undefined,
          redirectedReference,
          mode,
        );
        return {
          ...resolved,
          resolvedModule:
            resolved.resolvedModule ??
            resolveWorkspace(literal.text, containingFile, options, host, mode),
        };
      }),
    writeFile: () => {},
  };
  return { host, defaults, optionsForFile, configForFile, limitations };
};
