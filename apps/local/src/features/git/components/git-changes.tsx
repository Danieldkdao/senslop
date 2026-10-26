"use client";

import { useState } from "react";
import { Plus, Minus, ExternalLink, Layers, Layers2, Eye } from "lucide-react";
import type { GitStateSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/file-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { PreviewDiff } from "../../review/components/preview-diff";
import { useUiPreferences } from "../../settings/hooks/use-ui-preferences";
import { useGitWorkflow, useGitDiff } from "../hooks/use-git-workflow";
import { formatEditorUri } from "../lib/formatters";
import { CommitForm } from "./commit-form";

export const GitChanges = ({
  state,
  directory,
  onOpenFile,
  children,
}: {
  state: GitStateSchema;
  directory: string;
  onOpenFile: (path: string) => void;
  children?: React.ReactNode;
}) => {
  const git = useGitWorkflow();
  const ui = useUiPreferences();
  const [selected, setSelection] = useState<{
    path: string;
    staged: boolean;
  } | null>(null);
  const selectedFile = state.files.find((file) => file.path === selected?.path);
  const hasWorking =
    selectedFile &&
    (selectedFile.working !== " " || selectedFile.index === "?");
  const hasStaged =
    selectedFile && selectedFile.index !== " " && selectedFile.index !== "?";
  const selection =
    selected && selectedFile
      ? {
          path: selected.path,
          staged: selected.staged ? !!hasStaged : !hasWorking,
        }
      : null;
  const diff = useGitDiff(
    selection?.path ?? null,
    selection?.staged ?? false,
    state.identity,
  );
  const change = async (path: string, staged: boolean, hunk?: number) => {
    try {
      await git.act({
        action: staged ? "unstage" : "stage",
        path,
        expected: state.identity,
        hunk,
      });
    } catch {}
  };
  const hunkCount = diff.data?.diff.match(/^@@ /gm)?.length ?? 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto lg:flex-row lg:overflow-hidden">
      <div className="flex min-h-0 shrink-0 flex-col gap-4 lg:w-96 lg:shrink-0 lg:scroll-fade-y lg:overflow-auto [&>*]:shrink-0">
        {[false, true].map((staged) => {
          const files = state.files.filter((file) =>
            staged
              ? file.index !== " " && file.index !== "?"
              : file.working !== " " || file.index === "?",
          );
          return (
            <section
              key={String(staged)}
              className={cn(
                "flex shrink-0 flex-col overflow-hidden rounded-lg border",
                staged ? "border-primary/30 bg-primary/5" : "bg-muted/20",
              )}
            >
              <div className="flex min-h-14 shrink-0 items-center gap-3 border-b px-4 py-2">
                {staged ? (
                  <Layers className="size-5 shrink-0 text-primary" />
                ) : (
                  <Layers2 className="size-5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 font-medium leading-6">
                  {staged ? "Staged" : "Unstaged"} ({files.length})
                </span>
                <TooltipWrapper content={staged ? "Unstage all" : "Stage all"}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={staged ? "Unstage all" : "Stage all"}
                    disabled={!files.length || git.pending}
                    onClick={() =>
                      void git
                        .act({
                          action: staged ? "unstage-all" : "stage-all",
                          expected: state.identity,
                        })
                        .catch(() => {})
                    }
                  >
                    {staged ? (
                      <Minus className="size-5" />
                    ) : (
                      <Plus className="size-5" />
                    )}
                  </Button>
                </TooltipWrapper>
              </div>
              {files.map((file) => (
                <div
                  key={file.path}
                  className="flex min-w-0 items-center gap-1 px-2 py-1"
                >
                  <Button
                    variant="ghost"
                    className={cn(
                      "min-w-0 flex-1 justify-start gap-2 text-base",
                      selection?.path === file.path &&
                        selection.staged === staged &&
                        "bg-primary/10 text-primary",
                    )}
                    onClick={() => setSelection({ path: file.path, staged })}
                  >
                    <FileIcon fileName={file.path} />
                    <span className="min-w-0 flex-1 truncate text-left font-mono">
                      {file.path}
                    </span>
                    <span className="font-mono text-primary">
                      +{staged ? file.stagedAdded : file.added}
                    </span>
                    <span className="font-mono text-destructive">
                      −{staged ? file.stagedDeleted : file.deleted}
                    </span>
                  </Button>
                  <TooltipWrapper
                    content={staged ? "Unstage file" : "Stage file"}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${staged ? "Unstage" : "Stage"} ${file.path}`}
                      disabled={git.pending}
                      onClick={() => void change(file.path, staged)}
                    >
                      {staged ? (
                        <Minus className="size-5" />
                      ) : (
                        <Plus className="size-5" />
                      )}
                    </Button>
                  </TooltipWrapper>
                </div>
              ))}
              {!files.length && (
                <p className="p-3 text-muted-foreground">
                  No {staged ? "staged" : "unstaged"} changes.
                </p>
              )}
            </section>
          );
        })}
        <CommitForm state={state} />
        {children}
      </div>
      <section className="flex min-h-96 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="flex flex-col gap-2 border-b bg-muted/20 p-4">
          <p className="font-medium">
            Live Git {selection?.staged ? "staged" : "unstaged"} diff
          </p>
          {selection && (
            <div className="flex min-w-0 items-center gap-2">
              <TooltipWrapper content="Open this live file in VS Code">
                <Button
                  variant="link"
                  className="h-auto min-w-0 flex-1 justify-start gap-2 p-0 font-mono text-base"
                  render={
                    <a href={formatEditorUri(directory, selection.path)} />
                  }
                >
                  <FileIcon fileName={selection.path} />
                  <span className="min-w-0 truncate">{selection.path}</span>
                  <ExternalLink className="size-4 shrink-0" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="View captured file in review">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="View captured file in review"
                  onClick={() => onOpenFile(selection.path)}
                >
                  <Eye className="size-4" />
                </Button>
              </TooltipWrapper>
            </div>
          )}
          {diff.data && (
            <div className="flex gap-3 font-mono">
              <span className="text-primary">+{diff.data.added}</span>
              <span className="text-destructive">−{diff.data.deleted}</span>
            </div>
          )}
        </div>
        {diff.error && (
          <p role="alert" className="p-4 text-destructive">
            {diff.error.message}
          </p>
        )}
        {!selection && (
          <p className="p-4 text-muted-foreground">
            Select a changed file to inspect its live Git diff.
          </p>
        )}
        <div data-review-scroll className="min-h-0 flex-1 overflow-auto">
          {diff.data && (
            <PreviewDiff
              key={`${selection?.path}:${selection?.staged}:${state.identity}`}
              file={diff.data}
              view={ui.values.view}
              settings={ui.values.editor}
              notes={[]}
              onAddComment={() => {}}
              onDeleteNote={() => {}}
              readOnly
            />
          )}
        </div>
        {!!hunkCount && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t p-3">
            {Array.from({ length: hunkCount }, (_, index) => (
              <Button
                key={index}
                variant="outline"
                disabled={git.pending}
                onClick={() =>
                  selection &&
                  void change(selection.path, selection.staged, index)
                }
              >
                {selection?.staged ? (
                  <Minus className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {selection?.staged ? "Unstage" : "Stage"} hunk {index + 1}
              </Button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
