import {
  languageSettingsSchema,
  type LanguageSettingsSchema,
} from "@senslop/contracts";
import type { LocalStore } from "@senslop/review-core/storage";
import { projectPreferenceKey } from "@senslop/review-core/policy";

export const readLanguageSettings = (store: LocalStore, repository: string) => {
  const row = store.database
    .prepare("SELECT value FROM preferences WHERE name=?")
    .get(projectPreferenceKey(store, repository, "language_settings"));
  return languageSettingsSchema.parse(row ? JSON.parse(String(row.value)) : {});
};

export const saveLanguageSettings = (
  store: LocalStore,
  repository: string,
  input: LanguageSettingsSchema,
) => {
  const settings = languageSettingsSchema.parse(input);
  store.database
    .prepare(
      "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    )
    .run(
      projectPreferenceKey(store, repository, "language_settings"),
      JSON.stringify(settings),
    );
  return settings;
};
