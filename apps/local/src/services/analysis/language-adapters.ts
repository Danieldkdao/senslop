import { posix } from "node:path";
import type Parser from "tree-sitter";
import type { LanguageCapabilitySchema } from "@senslop/contracts";
import type {
  SourceMap,
  SourceSymbol,
  DependencyEdge,
  SourceDiagnostic,
} from "./types";

export const analyzeLanguageSources = async (sources: SourceMap) => {
  const symbols: SourceSymbol[] = [];
  const edges: DependencyEdge[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  const capabilities: Record<string, LanguageCapabilitySchema> = {};
  const limitations: string[] = [];
  const modulePath = /^module\s+(\S+)/m.exec(sources["go.mod"] ?? "")?.[1];
  for (const [path, source] of Object.entries(sources)) {
    const language = path.endsWith(".py")
      ? "Python"
      : path.endsWith(".go")
        ? "Go"
        : /\.[cm]?[jt]sx?$/.test(path)
          ? "JavaScript/TypeScript"
          : "Other";
    if (language === "JavaScript/TypeScript") continue;
    capabilities[path] = {
      language,
      level: "text",
      tool: null,
      limitations: ["Semantic relationships are unavailable."],
    };
    if (language === "Other") continue;
    try {
      const { default: TreeParser } = await import("tree-sitter");
      const grammar =
        language === "Python"
          ? (await import("tree-sitter-python")).default
          : (await import("tree-sitter-go")).default;
      const parser = new TreeParser();
      parser.setLanguage(grammar);
      const tree = parser.parse(source);
      if (!tree) throw new Error("Parser produced no syntax tree.");
      const declarationTypes =
        language === "Python"
          ? ["function_definition", "class_definition"]
          : [
              "function_declaration",
              "method_declaration",
              "type_spec",
              "var_spec",
              "const_spec",
            ];
      for (const node of tree.rootNode.descendantsOfType(declarationTypes)) {
        const name = node.childForFieldName("name");
        if (!name || symbols.length >= 10000) continue;
        symbols.push({
          name: name.text,
          path,
          start: node.startPosition.row + 1,
          end: node.endPosition.row + 1,
          kind: node.type,
          type: "",
          references: [],
          provenance: "syntactic",
          calls: node
            .descendantsOfType(
              language === "Python" ? ["call"] : ["call_expression"],
            )
            .map((call) => ({
              path,
              line: call.startPosition.row + 1,
              name: call.childForFieldName("function")?.text ?? "",
            })),
        });
      }
      const addImport = (specifier: string, candidates: string[]) => {
        const targets = candidates.filter((candidate) => candidate in sources);
        if (!targets.length)
          edges.push({
            from: path,
            to: specifier,
            specifier,
            typeOnly: false,
            provenance: "unresolved",
          });
        else
          for (const to of targets)
            edges.push({
              from: path,
              to,
              specifier,
              typeOnly: false,
              provenance: "syntactic",
            });
      };
      if (language === "Python")
        for (const node of tree.rootNode.descendantsOfType([
          "import_statement",
          "import_from_statement",
        ])) {
          const moduleNode = node.childForFieldName("module_name");
          const imports: Parser.SyntaxNode[] = moduleNode
            ? [moduleNode]
            : node.namedChildren.flatMap((child) =>
                child.type === "aliased_import"
                  ? (child.childForFieldName("name") ?? [])
                  : child.type === "dotted_name"
                    ? [child]
                    : [],
              );
          for (const imported of imports) {
            const specifier = imported.text;
            const dots = /^\.+/.exec(specifier)?.[0].length ?? 0;
            let base = dots ? posix.dirname(path) : "";
            for (let index = 1; index < dots; index++)
              base = posix.dirname(base);
            const moduleBase = posix.join(
              base,
              specifier.slice(dots).replaceAll(".", "/"),
            );
            addImport(specifier, [
              `${moduleBase}.py`,
              `${moduleBase}/__init__.py`,
            ]);
          }
        }
      if (language === "Go")
        for (const node of tree.rootNode.descendantsOfType("import_spec")) {
          const literal = node.childForFieldName("path")?.text;
          if (!literal) continue;
          const specifier = literal.slice(1, -1);
          const directory =
            modulePath && specifier.startsWith(`${modulePath}/`)
              ? specifier.slice(modulePath.length + 1)
              : null;
          addImport(
            specifier,
            directory === null
              ? []
              : Object.keys(sources).filter(
                  (candidate) =>
                    posix.dirname(candidate) === directory &&
                    candidate.endsWith(".go") &&
                    !candidate.endsWith("_test.go"),
                ),
          );
        }
      if (tree.rootNode.hasError) {
        const errors = tree.rootNode.descendantsOfType("ERROR");
        for (const node of errors.slice(0, 30))
          diagnostics.push({
            path,
            line: node.startPosition.row + 1,
            code: 0,
            severity: "error",
            message: `${language} syntax could not be parsed near ${node.text.slice(0, 80)}.`,
          });
        if (!errors.length)
          diagnostics.push({
            path,
            line: 1,
            code: 0,
            severity: "error",
            message: `${language} syntax tree contains missing syntax.`,
          });
      }
      capabilities[path] = {
        language,
        level: "parsing",
        tool: `Tree-sitter ${language === "Python" ? "Python" : "Go"} 0.25.0`,
        limitations: [
          "Syntax and import candidates are parsed; definitions, references and type diagnostics require configured semantic tooling.",
        ],
      };
    } catch (error) {
      const message = `${path}: ${language} parsing unavailable: ${(error as Error).message}`;
      capabilities[path]!.limitations = [message];
      limitations.push(message);
    }
  }
  return { symbols, edges, diagnostics, capabilities, limitations };
};
