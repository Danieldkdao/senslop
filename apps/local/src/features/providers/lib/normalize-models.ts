import type { CatalogModelSchema } from "../model-schemas";
import { formatCatalogModelName } from "./formatters";

export const matchesCatalogModel = (model: CatalogModelSchema, id: string) =>
  model.id === id || !!model.aliases?.includes(id);

export const normalizeModels = (
  models: CatalogModelSchema[],
): CatalogModelSchema[] => {
  const unique = new Map<string, CatalogModelSchema>();
  for (const model of models) {
    const existing = unique.get(model.id);
    unique.set(
      model.id,
      existing
        ? {
            ...existing,
            aliases: [
              ...new Set([
                ...(existing.aliases ?? []),
                ...(model.aliases ?? []),
              ]),
            ],
          }
        : model,
    );
  }
  const parents = new Map([...unique.keys()].map((id) => [id, id]));
  const root = (id: string): string => {
    let current = id;
    while (parents.get(current) !== current) {
      const parent = parents.get(current)!;
      parents.set(current, parents.get(parent)!);
      current = parent;
    }
    return current;
  };
  // Only explicit alias IDs link models; matching names do not prove equivalence.
  for (const model of unique.values())
    for (const alias of model.aliases ?? [])
      if (unique.has(alias)) parents.set(root(alias), root(model.id));
  const groups = new Map<string, CatalogModelSchema[]>();
  for (const model of unique.values()) {
    const id = root(model.id);
    const group = groups.get(id) ?? [];
    group.push(model);
    groups.set(id, group);
  }
  const options = [...groups.values()].map((group) => {
    // Prefer the provider's canonical name when it is also a returned model ID.
    group.sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        Number(b.id === b.name) - Number(a.id === a.name) ||
        a.id.localeCompare(b.id),
    );
    const model = group[0];
    const aliases = [
      ...new Set(
        group.flatMap((entry) => [entry.id, ...(entry.aliases ?? [])]),
      ),
    ]
      .filter((id) => id !== model.id)
      .sort((a, b) => a.localeCompare(b));
    return { ...model, ...(aliases.length ? { aliases } : {}) };
  });
  const counts = new Map<string, number>();
  for (const model of options)
    counts.set(model.name, (counts.get(model.name) ?? 0) + 1);
  return options
    .map((model) => ({
      ...model,
      name: formatCatalogModelName(
        model.name,
        model.id,
        counts.get(model.name)! > 1,
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
};
