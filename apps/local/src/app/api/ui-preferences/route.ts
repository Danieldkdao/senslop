import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import {
  uiPreferencesSchema,
  uiPreferencesPatchSchema,
} from "../../../features/settings/schemas";
import { mergeUiPreferences } from "../../../features/settings/lib/ui-preferences";

const readPreferences = () => {
  const existingPreferences = getWorkspace()
    .store.database.prepare(
      "SELECT value FROM preferences WHERE name = 'ui_preferences'",
    )
    .get();
  return uiPreferencesSchema.parse(
    existingPreferences ? JSON.parse(String(existingPreferences.value)) : {},
  );
};

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    return Response.json(readPreferences(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { message: "Could not load editor and appearance settings. Retry." },
      { status: 503 },
    );
  }
};

export const PATCH = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  const input = uiPreferencesPatchSchema.safeParse(
    await readLocalBody(request).catch(() => null),
  );
  if (!input.success)
    return Response.json(
      { message: "Check your editor and appearance settings and retry." },
      { status: 400 },
    );
  try {
    const store = getWorkspace().store;
    // Other open workspaces share this database, so merge under its write lock.
    const updatedPreferences = store.transaction(() => {
      const updatedPreferences = uiPreferencesSchema.parse(
        mergeUiPreferences(readPreferences(), input.data),
      );
      store.database
        .prepare(
          "INSERT INTO preferences VALUES ('ui_preferences', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        )
        .run(JSON.stringify(updatedPreferences));
      return updatedPreferences;
    });
    return Response.json(updatedPreferences, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { message: "Could not save editor and appearance settings. Retry." },
      { status: 503 },
    );
  }
};
