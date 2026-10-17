import ts from "typescript";
import { posix } from "node:path";
import type { SourceMap } from "./types";

type Manifest = {
  name?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
};

export const frozenPackages = (sources: SourceMap, root: string) => {
  const manifests = new Map<string, Manifest>();
  const packages = new Map<string, string>();
  for (const [path, text] of Object.entries(sources)) {
    if (posix.basename(path) !== "package.json") continue;
    try {
      const manifest = JSON.parse(text) as Manifest;
      if (!manifest || typeof manifest !== "object") continue;
      const directory = posix.dirname(root + path);
      manifests.set(directory, manifest);
      if (typeof manifest.name === "string")
        packages.set(manifest.name, directory);
    } catch {}
  }
  return (
    name: string,
    containingFile: string,
    options: ts.CompilerOptions,
    host: ts.ModuleResolutionHost,
    mode: ts.ResolutionMode,
  ) => {
    const packageName = name.startsWith("@")
      ? name.split("/").slice(0, 2).join("/")
      : name.split("/")[0]!;
    const directory = packages.get(packageName);
    if (!directory) return undefined;
    let manifest: Manifest | undefined;
    for (
      let current = posix.dirname(containingFile);
      current.startsWith(root.slice(0, -1));
      current = posix.dirname(current)
    ) {
      manifest = manifests.get(current);
      if (manifest || current === root.slice(0, -1)) break;
    }
    const declared = [
      manifest?.dependencies,
      manifest?.devDependencies,
      manifest?.peerDependencies,
      manifest?.optionalDependencies,
    ].some((dependencies) => {
      const specifier =
        dependencies && typeof dependencies === "object"
          ? dependencies[packageName]
          : undefined;
      return (
        typeof specifier === "string" && specifier.startsWith("workspace:")
      );
    });
    if (!declared) return undefined;
    const virtualPackage = `${root}node_modules/${packageName}`;
    const mapped = (path: string) =>
      path === virtualPackage || path.startsWith(virtualPackage + "/")
        ? directory + path.slice(virtualPackage.length)
        : path;
    // Let TypeScript interpret exports and conditions through a frozen workspace link.
    const resolved = ts.resolveModuleName(
      name,
      root + "__workspace__.ts",
      options,
      {
        ...host,
        readFile: (path) => host.readFile(mapped(path)),
        fileExists: (path) => host.fileExists(mapped(path)),
        directoryExists: (path) =>
          virtualPackage.startsWith(path.replace(/\/$/, "") + "/") ||
          (host.directoryExists?.(mapped(path)) ?? false),
        realpath: mapped,
      },
      undefined,
      undefined,
      mode,
    ).resolvedModule;
    return resolved
      ? {
          ...resolved,
          resolvedFileName: mapped(resolved.resolvedFileName),
          isExternalLibraryImport: false,
        }
      : undefined;
  };
};
