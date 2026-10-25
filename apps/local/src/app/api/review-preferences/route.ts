import { projectPreferenceKey } from "@senslop/review-core/policy";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import { reviewPreferencesSchema } from "../../../features/settings/schemas";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const key = projectPreferenceKey(
      workspace.store,
      await workspace.root(),
      "project_review_preferences",
    );
    const existingPreferences = workspace.store.database
      .prepare(
        "SELECT value FROM preferences WHERE name IN (?, 'review_preferences') ORDER BY name = ? DESC LIMIT 1",
      )
      .get(key, key);
    return Response.json(
      reviewPreferencesSchema.parse(
        existingPreferences
          ? JSON.parse(String(existingPreferences.value))
          : {},
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { message: "Could not load review preferences. Retry." },
      { status: 503 },
    );
  }
};

export const PUT = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  const input = reviewPreferencesSchema.safeParse(
    await readLocalBody(request).catch(() => null),
  );
  if (!input.success)
    return Response.json(
      { message: "Check your review preferences and retry." },
      { status: 400 },
    );
  try {
    const workspace = getWorkspace();
    const key = projectPreferenceKey(
      workspace.store,
      await workspace.root(),
      "project_review_preferences",
    );
    workspace.store.database
      .prepare(
        "INSERT INTO preferences VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
      )
      .run(key, JSON.stringify(input.data));
    return Response.json(input.data);
  } catch {
    return Response.json(
      { message: "Could not save review preferences. Retry." },
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
  const input = reviewPreferencesSchema
    .partial()
    .strict()
    .safeParse(await readLocalBody(request).catch(() => null));
  if (!input.success)
    return Response.json(
      { message: "Check the review preferences patch and retry." },
      { status: 400 },
    );
  try {
    const workspace = getWorkspace();
    const store = workspace.store;
    const key = projectPreferenceKey(
      store,
      await workspace.root(),
      "project_review_preferences",
    );
    const updatedPreferences = store.transaction(() => {
      const existingPreferences = store.database
        .prepare(
          "SELECT value FROM preferences WHERE name IN (?, 'review_preferences') ORDER BY name = ? DESC LIMIT 1",
        )
        .get(key, key);
      const updatedPreferences = reviewPreferencesSchema.parse({
        ...(existingPreferences
          ? JSON.parse(String(existingPreferences.value))
          : {}),
        ...input.data,
      });
      store.database
        .prepare(
          "INSERT INTO preferences VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        )
        .run(key, JSON.stringify(updatedPreferences));
      return updatedPreferences;
    });
    return Response.json(updatedPreferences);
  } catch {
    return Response.json(
      { message: "Could not save review preferences. Retry." },
      { status: 503 },
    );
  }
};
