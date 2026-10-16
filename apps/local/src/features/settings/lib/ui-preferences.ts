import type {
  EditorPreferencesSchema,
  UiPreferencesPatchSchema,
  UiPreferencesSchema,
} from "../schemas";

export const mergeUiPreferences = (
  current: UiPreferencesSchema,
  patch: UiPreferencesPatchSchema,
): UiPreferencesSchema => ({
  ...current,
  ...patch,
  editor: { ...current.editor, ...patch.editor },
});

export const changedEditorPreferences = (
  current: EditorPreferencesSchema,
  next: EditorPreferencesSchema,
): Partial<EditorPreferencesSchema> =>
  Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => current[key as keyof EditorPreferencesSchema] !== value,
    ),
  );
