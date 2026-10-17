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
    const existingPreferences = getWorkspace()
      .store.database.prepare(
        "SELECT value FROM preferences WHERE name = 'review_preferences'",
      )
      .get();
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
    getWorkspace()
      .store.database.prepare(
        "INSERT INTO preferences VALUES ('review_preferences', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(input.data));
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
    const store = getWorkspace().store;
    const updatedPreferences = store.transaction(() => {
      const existingPreferences = store.database
        .prepare(
          "SELECT value FROM preferences WHERE name = 'review_preferences'",
        )
        .get();
      const updatedPreferences = reviewPreferencesSchema.parse({
        ...(existingPreferences
          ? JSON.parse(String(existingPreferences.value))
          : {}),
        ...input.data,
      });
      store.database
        .prepare(
          "INSERT INTO preferences VALUES ('review_preferences', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        )
        .run(JSON.stringify(updatedPreferences));
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
