export const structuredChangeKinds = ["added", "removed", "changed"] as const;
export type StructuredChangeKind = (typeof structuredChangeKinds)[number];
export type StructuredChange = {
  path: string;
  kind: StructuredChangeKind;
  before: string | null;
  after: string | null;
};

export const compareStructuredData = (
  before: string | null,
  after: string | null,
) => {
  const changes: StructuredChange[] = [];
  let limited = false;
  try {
    const oldValue: unknown = before === null ? undefined : JSON.parse(before);
    const newValue: unknown = after === null ? undefined : JSON.parse(after);
    const visit = (old: unknown, next: unknown, path: string, depth = 0) => {
      if (changes.length >= 1000 || depth > 30) {
        limited = true;
        return;
      }
      if (Object.is(old, next)) return;
      if (
        old &&
        next &&
        typeof old === "object" &&
        typeof next === "object" &&
        Array.isArray(old) === Array.isArray(next)
      ) {
        for (const key of new Set([...Object.keys(old), ...Object.keys(next)]))
          visit(
            (old as Record<string, unknown>)[key],
            (next as Record<string, unknown>)[key],
            Array.isArray(old) ? `${path}[${key}]` : `${path}.${key}`,
            depth + 1,
          );
      } else
        changes.push({
          path,
          kind:
            old === undefined
              ? "added"
              : next === undefined
                ? "removed"
                : "changed",
          before: old === undefined ? null : JSON.stringify(old, null, 2),
          after: next === undefined ? null : JSON.stringify(next, null, 2),
        });
    };
    visit(oldValue, newValue, "$");
    return { changes, limited, error: null };
  } catch {
    return {
      changes,
      limited,
      error: "JSON structure could not be parsed. Open the original text diff.",
    };
  }
};
