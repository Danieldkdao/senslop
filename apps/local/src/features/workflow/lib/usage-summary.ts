import type { UsageRecordSchema } from "@senslop/contracts";

export const summarizeUsage = (records: UsageRecordSchema[]) => ({
  tokens: records.reduce(
    (sum, row) => sum + (row.inputTokens ?? 0) + (row.outputTokens ?? 0),
    0,
  ),
  incomplete: records.some(
    (row) => row.inputTokens === null || row.outputTokens === null,
  ),
  durationMs: records.reduce((sum, row) => sum + row.durationMs, 0),
  cost:
    records.length && records.every((row) => row.estimatedCost !== null)
      ? records.reduce((sum, row) => sum + row.estimatedCost!, 0)
      : null,
});

export const groupUsage = (
  records: UsageRecordSchema[],
  by: "day" | "task",
) => {
  const groups = new Map<
    string,
    {
      key: string;
      inputTokens: number | null;
      outputTokens: number | null;
      durationMs: number;
      unknown: number;
    }
  >();
  for (const record of records) {
    const key = by === "day" ? record.createdAt.slice(0, 10) : record.task;
    const group = groups.get(key) ?? {
      key,
      inputTokens: null,
      outputTokens: null,
      durationMs: 0,
      unknown: 0,
    };
    if (record.inputTokens !== null)
      group.inputTokens = (group.inputTokens ?? 0) + record.inputTokens;
    if (record.outputTokens !== null)
      group.outputTokens = (group.outputTokens ?? 0) + record.outputTokens;
    group.durationMs += record.durationMs;
    if (record.inputTokens === null || record.outputTokens === null)
      group.unknown++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
};
