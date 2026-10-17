const formatResultRow = (value: unknown) => {
  if (!value || typeof value !== "object") return String(value);
  const row = value as Record<string, unknown>;
  if (typeof row.body === "string")
    return `${row.id}\n${row.path}\n${row.body}`;
  return [
    row.id ?? row.path ?? "",
    row.title ?? row.name ?? "",
    row.kind ?? "",
    row.status ?? "",
    typeof row.fileCount === "number"
      ? `${row.completedCount ?? 0}/${row.fileCount} files`
      : "",
  ]
    .filter(Boolean)
    .join("  ");
};

const formatPreparationStage = (label: string, value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const stage = value as Record<string, unknown>;
  return `${label}: ${stage.status} (${stage.id})`;
};

export const formatCommandResult = (value: unknown, json: boolean) => {
  if (json) return JSON.stringify(value ?? null, null, 2);
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.length ? value.map(formatResultRow).join("\n") : "No results.";
  if (value && typeof value === "object") {
    const result = value as Record<string, unknown>;
    const rows = result.history ?? result.items ?? result.connections;
    if (Array.isArray(rows))
      return `${rows.length ? rows.map(formatResultRow).join("\n") : "No results."}${result.next !== undefined && result.next !== null ? `\nNext page: --offset ${result.next}` : ""}`;
    if (
      result.preparation &&
      result.review &&
      typeof result.review === "object"
    ) {
      const review = result.review as Record<string, unknown>;
      const preparation = result.preparation as Record<string, unknown>;
      return [
        `Review ${result.id}`,
        review.title,
        `${Array.isArray(review.files) ? review.files.length : 0} files`,
        result.url,
        formatPreparationStage("Grouping", preparation.grouping),
        formatPreparationStage("AI review", preparation.review),
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
  return JSON.stringify(value ?? null, null, 2);
};
