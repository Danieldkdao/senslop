import { z } from "zod";
import { applicationThemes } from "@/lib/constants";
import {
  buddyCharacters,
  buddyMaxSize,
  buddyMinSize,
  buddySize,
  defaultBuddyCharacter,
} from "../buddy/constants";
import {
  whitespaceModes,
  defaultDiffSettings,
  diffFonts,
  diffIndicators,
  diffThemeValues,
  diffViews,
  inlineChangeStyles,
} from "../review/constants";

export const editorPreferencesSchema = z
  .object({
    whitespace: z.enum(whitespaceModes).optional(),
    theme: z.enum(diffThemeValues),
    font: z.enum(diffFonts),
    fontSize: z.number().int().min(12).max(32),
    lineHeight: z.number().int().min(16).max(28),
    indicators: z.enum(diffIndicators),
    inlineChanges: z.enum(inlineChangeStyles),
    backgrounds: z.boolean(),
    wrapping: z.boolean(),
    lineNumbers: z.boolean(),
  })
  .strict();
export type EditorPreferencesSchema = z.infer<typeof editorPreferencesSchema>;

export const panelPreferencesSchema = z
  .object({
    "review-files": z.number().positive().max(100),
    "review-canvas": z.number().positive().max(100),
    "review-agents": z.number().positive().max(100),
  })
  .strict()
  .refine(
    (panels) =>
      Math.abs(
        Object.values(panels).reduce((sum, size) => sum + size, 0) - 100,
      ) < 0.1,
  );
export type PanelPreferencesSchema = z.infer<typeof panelPreferencesSchema>;

export const buddyPreferencesSchema = z
  .object({
    visible: z.boolean(),
    animations: z.boolean(),
    character: z.enum(buddyCharacters),
    size: z.number().int().min(buddyMinSize).max(buddyMaxSize),
    position: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .strict()
      .nullable(),
  })
  .strict();
export type BuddyPreferencesSchema = z.infer<typeof buddyPreferencesSchema>;

export const uiPreferencesSchema = z
  .object({
    editor: editorPreferencesSchema.default(defaultDiffSettings),
    view: z.enum(diffViews).default("split"),
    applicationTheme: z.enum(applicationThemes).nullable().default(null),
    panels: panelPreferencesSchema.nullable().default(null),
    buddy: buddyPreferencesSchema
      .extend({
        size: buddyPreferencesSchema.shape.size.default(buddySize),
        character: buddyPreferencesSchema.shape.character.default(
          defaultBuddyCharacter,
        ),
      })
      .default(() => ({
        visible: true,
        animations: true,
        size: buddySize,
        character: defaultBuddyCharacter,
        position: null,
      })),
  })
  .strict();
export type UiPreferencesSchema = z.infer<typeof uiPreferencesSchema>;

export const uiPreferencesPatchSchema = z
  .object({
    editor: editorPreferencesSchema.partial().optional(),
    view: z.enum(diffViews).optional(),
    applicationTheme: z.enum(applicationThemes).nullable().optional(),
    panels: panelPreferencesSchema.nullable().optional(),
    buddy: buddyPreferencesSchema.partial().optional(),
  })
  .strict();
export type UiPreferencesPatchSchema = z.infer<typeof uiPreferencesPatchSchema>;

export const reviewPreferencesSchema = z
  .object({
    autoAdvance: z.boolean().default(false),
  })
  .strict();
export type ReviewPreferencesSchema = z.infer<typeof reviewPreferencesSchema>;
