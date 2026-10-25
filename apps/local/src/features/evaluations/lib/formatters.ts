import { FlaskConical, Sparkles, CircleCheck, CircleX } from "lucide-react";
import type { EvaluationMode, EvaluationRunSchema } from "../schemas";

export const formatEvaluationMode = (mode: EvaluationMode) => {
  switch (mode) {
    case "deterministic":
      return { label: "Deterministic contracts", Icon: FlaskConical };
    case "live":
      return { label: "Live model", Icon: Sparkles };
  }
};

export const formatEvaluationRun = (run: EvaluationRunSchema) =>
  `${formatEvaluationMode(run.mode).label} — ${run.model ?? "fixture examples"}, ${new Date(run.createdAt).toLocaleString()}`;
export const formatEvaluationPercent = (value: number | null) =>
  value === null ? "Unknown" : `${Math.round(value * 100)}%`;

export const formatEvaluationCaseStatus = (passed: boolean) =>
  passed
    ? {
        label: "Contracts passed",
        Icon: CircleCheck,
        className: "text-success",
      }
    : {
        label: "Contract failure",
        Icon: CircleX,
        className: "text-destructive",
      };

export const formatEvaluationDuration = (durationMs: number) =>
  `${(durationMs / 1000).toFixed(1)}s`;

export const formatEvaluationTokens = (
  input: number | null,
  output: number | null,
) =>
  input === null || output === null
    ? "Unknown"
    : (input + output).toLocaleString();

export const formatEvaluationCost = (cost: number | null) =>
  cost === null ? "Unknown" : String(cost);

export const formatEvaluationLimitations = (mode: EvaluationMode) => {
  switch (mode) {
    case "deterministic":
      return "Fixture checks validate app behavior without measuring live-model quality or setting promotion thresholds, and unknown usage or costs remain unknown.";
    case "live":
      return "Live runs assess findings and grouping with manual inspection, while workflow checks remain deterministic, promotion thresholds are unset, and unknown usage or costs remain unknown.";
  }
};
