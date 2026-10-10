"use client";

import { useId, useMemo } from "react";
import { useTheme } from "next-themes";
import { MultiFileDiff, type FileContents } from "@pierre/diffs/react";
import { getDiffOptions } from "../../review/lib/diff-options";
import type { DiffSettingsState, DiffView } from "../../review/types";

type EditorDiffPreviewProps = {
  settings: DiffSettingsState;
  view: DiffView;
};

const oldFile: FileContents = {
  name: "welcome.ts",
  contents: `type Member = {
  name: string;
  active: boolean;
};

const retryLimit = 3;
const defaultRole = "viewer";

export const welcomeMember = (member: Member) => {
  const role = defaultRole;
  const attempts = retryLimit;

  if (!member.active) {
    return "Your invitation is pending.";
  }

  const greeting = "Hello";
  const message = greeting + ", " + member.name + "!";
  const help = "Browse your projects, invite a teammate, and explore the workspace. This longer line lets you compare horizontal scrolling with wrapped code while keeping the surrounding context visible.";
  console.debug(message);

  return { message, help, role, attempts };
};
`,
};

const newFile: FileContents = {
  name: "welcome.ts",
  contents: `type Member = {
  name: string;
  active: boolean;
};

const retryLimit = 5;
const defaultRole = "reviewer";

export const welcomeMember = (member: Member) => {
  const role = defaultRole;
  const attempts = retryLimit;

  if (!member.active) {
    return "Your invitation is pending.";
  }

  const greeting = "Welcome";
  const message = greeting + ", " + member.name.trim() + "!";
  const help = "Review your changes, invite a teammate, and explore the workspace. This longer line lets you compare horizontal scrolling with wrapped code while keeping the surrounding context visible.";
  const ready = true;

  return { message, help, role, attempts, ready };
};
`,
};

export const EditorDiffPreview = ({
  settings,
  view,
}: EditorDiffPreviewProps) => {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const options = useMemo(
    () => getDiffOptions(settings, view, resolvedTheme),
    [settings, view, resolvedTheme],
  );
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-3 text-base">
      <div className="flex flex-col gap-1">
        <h3 id={id} className="font-medium">
          Diff preview
        </h3>
        <p className="text-muted-foreground">
          Sample code updates as you change the settings above.
        </p>
      </div>
      <div className="min-w-0 max-w-full overflow-hidden rounded-xl border">
        <p className="border-b bg-muted px-4 py-2 font-mono">welcome.ts</p>
        <div className="max-h-[28rem] overflow-auto">
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={options}
            className="preview-diff"
          />
        </div>
      </div>
    </section>
  );
};
