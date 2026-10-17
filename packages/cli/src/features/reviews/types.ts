export type ReviewJob = {
  id: string;
  snapshotId: string;
  hash: string;
  snapshotRound?: number;
  kind: "grouping" | "review";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  progress: string;
  error: string | null;
  result: {
    groups?: unknown[];
    findings?: Array<{ fixPrompt: string; [key: string]: unknown }>;
    fixAllPrompt?: string;
    [key: string]: unknown;
  } | null;
};
