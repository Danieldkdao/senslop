import type { LanguageCapabilitySchema } from "@senslop/contracts";

export type SourceMap = Record<string, string>;
export type DependencyEdge = {
  from: string;
  to: string;
  specifier: string;
  typeOnly: boolean;
  provenance: "compiler-resolved" | "unresolved" | "syntactic";
};
export type SourceSymbol = {
  callers?: { path: string; line: number }[];
  provenance?: "compiler-resolved" | "syntactic";
  calls?: { path: string; line: number; name: string }[];
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
  settingsHash?: string;
  capabilities?: Record<string, LanguageCapabilitySchema>;
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
