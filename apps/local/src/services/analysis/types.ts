export type SourceMap = Record<string, string>;
export type DependencyEdge = {
  from: string;
  to: string;
  specifier: string;
  typeOnly: boolean;
  provenance: "compiler-resolved" | "unresolved" | "syntactic";
};
export type SourceSymbol = {
  name: string;
  path: string;
  start: number;
  end: number;
  kind: string;
  type: string;
  references: { path: string; line: number }[];
};
export type SourceDiagnostic = {
  path: string;
  line: number;
  code: number;
  message: string;
  severity: "error" | "warning";
};
export type Analysis = {
  version?: number;
  edges: DependencyEdge[];
  symbols: SourceSymbol[];
  diagnostics: SourceDiagnostic[];
  cycles: string[][];
  limitations: string[];
};
export type AnalysisContext = {
  sources: SourceMap;
  before?: SourceMap;
  analysis: Analysis;
  limitations: string[];
};
