"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  previewSourceKinds,
  type SourceSelectionSchema,
} from "@senslop/contracts";
import { assignedModel } from "../../agents/lib/model-selection";
import { useAiSettings } from "../../agents/hooks/use-ai-settings";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { LivePreview } from "../../review/types";
import { formatPreviewSource } from "../../review/lib/formatters";
import {
  formatFreshness,
  formatRepository,
  formatSnapshot,
} from "../lib/formatters";
import type { WorkspaceMetadata } from "../types";

const inspectionSchema = z
  .object({
    group: z.boolean(),
    kind: z.enum(previewSourceKinds),
    commit: z.string().trim().max(200),
    base: z.string().trim().max(200),
    head: z.string().trim().max(200),
    branch: z.string().trim().max(200),
  })
  .superRefine((value, ctx) => {
    const required = (name: "commit" | "base" | "head" | "branch") => {
      if (!value[name])
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "Choose a revision.",
        });
    };
    if (value.kind === "commit") required("commit");
    if (value.kind === "range") {
      required("base");
      required("head");
    }
    if (value.kind === "branch") required("branch");
  });
export type InspectionSchema = z.infer<typeof inspectionSchema>;

type NewReviewPopoverProps = {
  metadata: WorkspaceMetadata | null;
  preview: LivePreview | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onInspect: (
    source: SourceSelectionSchema,
    grouping?: boolean,
  ) => Promise<boolean>;
};

export const NewReviewPopover = ({
  metadata,
  preview,
  loading,
  busy,
  error,
  onInspect,
}: NewReviewPopoverProps) => {
  const { settings } = useAiSettings();
  const groupingConfigured = !!assignedModel(settings.data, "grouping");
  const [open, setOpen] = useState(false);
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InspectionSchema>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: {
      group: true,
      kind: "working-tree",
      commit: "HEAD",
      base: "",
      head: "HEAD",
      branch: "",
    },
  });
  const kind = useWatch({ control, name: "kind" });
  const revisions = [
    "HEAD",
    ...(metadata?.repository?.commits.map((commit) => commit.id) ?? []),
  ];
  const formatRevisionLabel = (revision: string) => {
    if (revision === "HEAD") return "Latest commit: local HEAD";
    const commit = metadata?.repository?.commits.find(
      (commit) => commit.id === revision,
    );
    return commit ? `${commit.id.slice(0, 8)}: ${commit.subject}` : revision;
  };
  const inspect = handleSubmit(async (values) => {
    let source: SourceSelectionSchema = { kind: "working-tree" };
    switch (values.kind) {
      case "working-tree":
        source = { kind: values.kind };
        break;
      case "commit":
        source = { kind: values.kind, commit: values.commit };
        break;
      case "range":
        source = { kind: values.kind, base: values.base, head: values.head };
        break;
      case "branch":
        source = {
          kind: values.kind,
          branch: values.branch,
          base: values.base || "HEAD",
        };
        break;
    }
    const succeeded =
      settings.data?.groupingMode === "ask"
        ? await onInspect(source, groupingConfigured && values.group)
        : await onInspect(source);
    if (succeeded) setOpen(false);
  });
  const revisionInput = (name: "commit" | "head" | "base", label: string) => (
    <div className="min-w-0 flex-1 flex flex-col gap-1">
      <label htmlFor={`git-${name}`}>{label}</label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Combobox
            items={revisions}
            value={field.value || null}
            inputValue={field.value}
            onValueChange={(value) => {
              if (value !== null) field.onChange(value);
            }}
            onInputValueChange={(value, details) => {
              if (details.reason === "input-change") field.onChange(value);
            }}
            filter={(revision, query) =>
              `${revision} ${formatRevisionLabel(revision)}`
                .toLowerCase()
                .includes(query.toLowerCase())
            }
          >
            <ComboboxInput
              id={`git-${name}`}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              placeholder={name === "base" ? "HEAD" : undefined}
              className="w-full text-base **:data-[slot=input-group-control]:text-base"
              aria-invalid={!!errors[name]}
              aria-describedby={errors[name] ? `git-${name}-error` : undefined}
            />
            <ComboboxContent className="text-base">
              <ComboboxEmpty className="p-3 text-base">
                No matching commits. You can use the revision you typed.
              </ComboboxEmpty>
              <ComboboxList>
                {(revision: string) => (
                  <ComboboxItem
                    key={revision}
                    value={revision}
                    className="text-base"
                  >
                    <span className="truncate">
                      {formatRevisionLabel(revision)}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        )}
      />
      {errors[name] && (
        <p id={`git-${name}-error`} role="alert" className="text-destructive">
          {errors[name]?.message}
        </p>
      )}
    </div>
  );
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <TooltipWrapper content="New review">
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="New review" />
            }
          >
            <Plus aria-hidden="true" className="size-5" />
          </PopoverTrigger>
        </TooltipWrapper>
        <PopoverContent
          align="end"
          className="w-[30rem] max-w-[calc(100vw-2rem)] max-h-[85dvh] overflow-auto text-base gap-4"
        >
          <PopoverTitle>New review</PopoverTitle>
          <div className="flex flex-col gap-1">
            <p className="break-all font-medium">
              {loading
                ? "Loading repository…"
                : (metadata?.root ?? "Repository unavailable")}
            </p>
            <p className="text-muted-foreground">
              {formatRepository(metadata?.repository)}
            </p>
          </div>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={inspect}
            aria-busy={busy}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="git-kind">Changes to inspect</label>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="git-kind"
                      className="w-full text-base"
                      onBlur={field.onBlur}
                      ref={field.ref}
                    >
                      <SelectValue>
                        {formatPreviewSource(field.value)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working-tree">
                        Uncommitted changes
                      </SelectItem>
                      <SelectItem value="commit">Single commit</SelectItem>
                      <SelectItem value="range">Commit range</SelectItem>
                      <SelectItem value="branch">Branch comparison</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {kind === "commit" &&
              revisionInput("commit", "Commit: latest is HEAD")}
            {kind === "range" && (
              <>
                {revisionInput("base", "Ancestor commit")}
                {revisionInput("head", "Descendant commit")}
              </>
            )}
            {kind === "branch" && (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor="git-branch">Compare branch</label>
                  <Controller
                    control={control}
                    name="branch"
                    render={({ field }) => (
                      <Select
                        value={field.value || null}
                        onValueChange={(value) => field.onChange(value ?? "")}
                      >
                        <SelectTrigger
                          id="git-branch"
                          className="w-full text-base"
                          aria-invalid={!!errors.branch}
                          onBlur={field.onBlur}
                          ref={field.ref}
                        >
                          <SelectValue placeholder="Choose branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {metadata?.repository?.branches.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              {branch}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.branch && (
                    <p role="alert" className="text-destructive">
                      {errors.branch.message}
                    </p>
                  )}
                </div>
                {revisionInput("base", "Base revision: optional")}
              </>
            )}
            {settings.data?.groupingMode === "ask" && (
              <div className="rounded-lg border p-3 flex flex-col gap-2">
                <label
                  htmlFor="review-grouping"
                  className="flex items-center justify-between gap-3"
                >
                  Group and summarize this review
                  <Controller
                    name="group"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id="review-grouping"
                        checked={groupingConfigured && field.value}
                        onCheckedChange={field.onChange}
                        disabled={busy || !groupingConfigured}
                      />
                    )}
                  />
                </label>
                <p className="text-muted-foreground">
                  Wait for AI to prepare groups and file summaries before
                  opening changes.
                </p>
              </div>
            )}
            <Button
              type="submit"
              aria-label="Inspect changes"
              aria-busy={busy}
              disabled={busy || loading || !metadata?.repository}
            >
              <LoadingSwap isLoading={busy}>Inspect changes</LoadingSwap>
            </Button>
          </form>
          {preview?.hash && (
            <p className="break-all text-muted-foreground">
              {preview.title}
              <br />
              {formatSnapshot(preview.hash)}
              <br />
              {formatFreshness(
                preview.fingerprint,
                metadata?.repository?.fingerprint,
              )}
            </p>
          )}
          {preview?.error && (
            <p role="alert" className="text-destructive">
              {preview.error}
            </p>
          )}
          {!!preview?.excluded.length && (
            <details className="text-muted-foreground">
              <summary>{preview.excluded.length} excluded files</summary>
              <ul>
                {preview.excluded.map((file) => (
                  <li key={file.path}>
                    <span className="font-mono">{file.path}</span>:{" "}
                    {file.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 text-destructive"
            >
              <p>{error}</p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void inspect()}
              >
                Retry inspection
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {error && !open && (
        <p role="alert" className="sr-only">
          {error}
        </p>
      )}
    </>
  );
};
