"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  previewSourceKinds,
  type SourceSelectionSchema,
} from "@senslop/contracts";
import { Plus } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onInspect: (source: SourceSelectionSchema) => Promise<boolean>;
};

export const NewReviewPopover = ({
  metadata,
  preview,
  loading,
  busy,
  error,
  onInspect,
}: NewReviewPopoverProps) => {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InspectionSchema>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: {
      kind: "working-tree",
      commit: "HEAD",
      base: "",
      head: "HEAD",
      branch: "",
    },
  });
  const kind = useWatch({ control, name: "kind" });
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
    if (await onInspect(source)) setOpen(false);
  });
  const revisionInput = (name: "commit" | "head" | "base", label: string) => (
    <div className="min-w-0 flex-1 flex flex-col gap-1">
      <label htmlFor={`git-${name}`}>{label}</label>
      <Input
        id={`git-${name}`}
        list="local-commits"
        placeholder={name === "base" ? "HEAD" : undefined}
        className="text-base"
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `git-${name}-error` : undefined}
        {...register(name)}
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
            <datalist id="local-commits" className="font-sans">
              <option value="HEAD" className="font-sans">
                Latest commit: local HEAD
              </option>
              {metadata?.repository?.commits.map((commit) => (
                <option key={commit.id} value={commit.id} className="font-sans">
                  {commit.id.slice(0, 8)}: {commit.subject}
                </option>
              ))}
            </datalist>
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
            <Button
              type="submit"
              disabled={busy || loading || !metadata?.repository}
            >
              {busy ? "Inspecting…" : "Inspect changes"}
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
                    {file.path}: {file.reason}
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
