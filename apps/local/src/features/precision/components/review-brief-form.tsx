"use client";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { formatCheckStatus } from "../../workflow/lib/formatters";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  reviewBriefInputSchema,
  reviewCriterionSchema,
  type ReviewBriefSchema,
  type CheckRunSchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ReviewIntentActionSchema } from "../schemas";

const reviewBriefFormSchema = reviewBriefInputSchema
  .omit({ links: true })
  .extend({
    linksText: z.string().refine(
      (value) =>
        value
          .split("\n")
          .filter((line) => line.trim())
          .every(
            (line) =>
              reviewBriefInputSchema.shape.links.element.safeParse(line.trim())
                .success,
          ),
      "Enter one valid URL per line.",
    ),
  });
export type ReviewBriefFormSchema = z.infer<typeof reviewBriefFormSchema>;

export const ReviewBriefForm = ({
  brief,
  history = [],
  documents,
  checks,
  onAction,
  onClose,
}: {
  brief?: ReviewBriefSchema | null;
  history?: ReviewBriefSchema[];
  documents: string[];
  checks: CheckRunSchema[];
  onAction: (operation: ReviewIntentActionSchema) => Promise<unknown>;
  onClose: () => void;
}) => {
  const [suggesting, setSuggesting] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof reviewBriefFormSchema>,
    unknown,
    ReviewBriefFormSchema
  >({
    resolver: zodResolver(reviewBriefFormSchema),
    defaultValues: {
      request: brief?.request ?? "",
      documents: brief?.documents ?? [],
      linksText: brief?.links.join("\n") ?? "",
      criteria: brief?.criteria ?? [],
    },
  });
  const criteria = useFieldArray({
    control,
    name: "criteria",
    keyName: "fieldId",
  });
  const requestText = useWatch({ control, name: "request" });
  const selectedDocuments = useWatch({ control, name: "documents" });
  const linkedCriteria = useWatch({ control, name: "criteria" });
  const suggest = async () => {
    setSuggesting(true);
    try {
      const output = await onAction({
        action: "suggest-criteria",
        request: getValues("request"),
        documents: getValues("documents").map((document) => document.path),
      });
      const suggested = z.array(reviewCriterionSchema).parse(output);
      criteria.append(
        suggested.map((criterion) => ({
          ...criterion,
          id: crypto.randomUUID(),
          checkIds: [],
        })),
      );
    } catch {
    } finally {
      setSuggesting(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-auto text-base sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review brief</DialogTitle>
          <DialogDescription>
            Capture the original request and editable acceptance criteria.
            Saving keeps earlier versions.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={handleSubmit(async ({ linksText, ...values }) => {
            try {
              await onAction({
                action: "save-brief",
                version: brief?.version ?? 0,
                brief: {
                  ...values,
                  links: linksText
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                },
              });
              onClose();
            } catch {}
          })}
        >
          <label className="flex flex-col gap-2">
            Original request
            <Textarea
              {...register("request")}
              className="min-h-36 w-full text-base"
              aria-invalid={!!errors.request}
            />
          </label>
          {errors.request && <p role="alert">{errors.request.message}</p>}
          <Select
            value={null}
            onValueChange={(value) => {
              if (
                value &&
                !selectedDocuments.some((document) => document.path === value)
              )
                setValue(
                  "documents",
                  [...selectedDocuments, { path: value, contents: "" }],
                  { shouldDirty: true },
                );
            }}
          >
            <SelectTrigger
              aria-label="Attach captured document"
              className="w-full text-base"
            >
              <SelectValue placeholder="Attach a captured Markdown or text document" />
            </SelectTrigger>
            <SelectContent>
              {documents.map((path) => (
                <SelectItem key={path} value={path} className="font-mono">
                  {path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDocuments.map((document) => (
            <div key={document.path} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 break-all font-mono">
                {document.path}
              </span>
              <TooltipWrapper content="Remove document">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${document.path}`}
                  onClick={() =>
                    setValue(
                      "documents",
                      selectedDocuments.filter(
                        (item) => item.path !== document.path,
                      ),
                    )
                  }
                >
                  <X />
                </Button>
              </TooltipWrapper>
            </div>
          ))}
          <label className="flex flex-col gap-2">
            Reference links
            <Textarea
              {...register("linksText")}
              className="w-full text-base"
              placeholder="One link per line. Links are references; their contents are not automatically fetched."
              aria-invalid={!!errors.linksText}
            />
          </label>
          {errors.linksText && <p role="alert">{errors.linksText.message}</p>}
          <div className="flex items-center gap-2">
            <span className="flex-1 font-medium">Acceptance criteria</span>
            <TooltipWrapper content="Suggest criteria from the request">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Suggest criteria"
                disabled={suggesting || !requestText.trim()}
                onClick={() => void suggest()}
              >
                <LoadingSwap isLoading={suggesting}>
                  <Sparkles />
                </LoadingSwap>
              </Button>
            </TooltipWrapper>
            <TooltipWrapper content="Add criterion">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Add criterion"
                onClick={() =>
                  criteria.append({
                    id: crypto.randomUUID(),
                    text: "",
                    sourceQuote: "",
                    checkIds: [],
                  })
                }
              >
                <Plus />
              </Button>
            </TooltipWrapper>
          </div>
          {criteria.fields.map((field, index) => (
            <div
              key={field.fieldId}
              className="flex flex-col gap-3 rounded-lg border p-3"
            >
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  Criterion {index + 1}
                  <Textarea
                    {...register(`criteria.${index}.text`)}
                    className="w-full text-base"
                    aria-invalid={!!errors.criteria?.[index]?.text}
                  />
                </label>
                <TooltipWrapper content="Move criterion up">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move criterion up"
                    disabled={index === 0}
                    onClick={() => criteria.move(index, index - 1)}
                  >
                    <ArrowUp />
                  </Button>
                </TooltipWrapper>
                <TooltipWrapper content="Move criterion down">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move criterion down"
                    disabled={index === criteria.fields.length - 1}
                    onClick={() => criteria.move(index, index + 1)}
                  >
                    <ArrowDown />
                  </Button>
                </TooltipWrapper>
                <TooltipWrapper content="Remove criterion">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove criterion"
                    onClick={() => criteria.remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </TooltipWrapper>
              </div>
              {errors.criteria?.[index]?.text && (
                <p role="alert">{errors.criteria[index]?.text?.message}</p>
              )}
              <label className="flex flex-col gap-1">
                Original wording
                <Input
                  {...register(`criteria.${index}.sourceQuote`)}
                  className="w-full text-base"
                />
              </label>
              <Collapsible>
                <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer text-muted-foreground">
                  Link relevant checks
                  <ChevronDown
                    aria-hidden="true"
                    className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                  <p className="py-2 text-muted-foreground">
                    Select checks that verify this criterion. Only passing
                    checks for this exact changed revision establish
                    verification.
                  </p>
                  <div className="flex flex-col gap-2">
                    {checks.map((check) => (
                      <label key={check.id} className="flex items-start gap-2">
                        <Checkbox
                          checked={
                            linkedCriteria[index]?.checkIds?.includes(
                              check.id,
                            ) ?? false
                          }
                          onCheckedChange={(checked) => {
                            const current =
                              getValues(`criteria.${index}.checkIds`) ?? [];
                            setValue(
                              `criteria.${index}.checkIds`,
                              checked
                                ? [...current, check.id]
                                : current.filter((id) => id !== check.id),
                            );
                          }}
                        />
                        <span className="break-all font-mono">
                          {check.command}
                          <span className="block font-sans text-muted-foreground">
                            Round {check.review.round}:{" "}
                            {formatCheckStatus(check.status).label}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
          <Button type="submit" disabled={isSubmitting || suggesting}>
            <LoadingSwap isLoading={isSubmitting}>Save brief</LoadingSwap>
          </Button>
        </form>
        {!!history.length && (
          <Collapsible>
            <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer text-muted-foreground">
              Saved brief versions
              <ChevronDown
                aria-hidden="true"
                className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
              <div className="flex flex-col gap-3 pt-3">
                {history.map((item) => (
                  <Collapsible key={item.version}>
                    <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer">
                      Version {item.version}, source round {item.review.round}
                      <ChevronDown
                        aria-hidden="true"
                        className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                      <p className="whitespace-pre-wrap py-2">{item.request}</p>
                      {item.criteria.map((criterion) => (
                        <p key={criterion.id} className="py-1">
                          {criterion.text}
                        </p>
                      ))}
                      {item.documents.map((document) => (
                        <Collapsible key={document.path}>
                          <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer break-all font-mono">
                            {document.path}
                            <ChevronDown
                              aria-hidden="true"
                              className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                            />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-base">
                              {document.contents}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </DialogContent>
    </Dialog>
  );
};
