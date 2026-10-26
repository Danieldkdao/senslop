"use client";

import { z } from "zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookmarkPlus } from "lucide-react";
import {
  memoryGuidanceSchema,
  type MemoryGuidanceSchema,
  type MemoryOriginKind,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProjectMemory } from "../hooks/use-project-memory";

export const RememberDecision = ({
  review,
  text,
  path,
  originId,
  originKind,
}: {
  review: ReviewIdentitySchema;
  text: string;
  path: string;
  originId: string | null;
  originKind: MemoryOriginKind;
}) => {
  const [open, setOpen] = useState(false);
  const memory = useProjectMemory();
  const form = useForm<
    z.input<typeof memoryGuidanceSchema>,
    unknown,
    MemoryGuidanceSchema
  >({
    resolver: zodResolver(memoryGuidanceSchema),
    defaultValues: { text, paths: [path], assumption: "", enabled: true },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipWrapper content="Remember as project guidance">
        <DialogTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remember as project guidance"
            />
          }
        >
          <BookmarkPlus className="size-4" />
        </DialogTrigger>
      </TooltipWrapper>
      <DialogContent className="text-base">
        <DialogHeader>
          <DialogTitle>Remember decision</DialogTitle>
          <DialogDescription>
            Apply this guidance to future reviews within its scope and
            assumptions.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(async (guidance) => {
            try {
              await memory.act({
                action: "create",
                guidance,
                review,
                originKind,
                originId,
              });
              setOpen(false);
            } catch {}
          })}
        >
          <label className="flex flex-col gap-1">
            Guidance
            <Textarea
              className="w-full text-base"
              {...form.register("text")}
              aria-invalid={!!form.formState.errors.text}
            />
          </label>
          {form.formState.errors.text && (
            <p role="alert">{form.formState.errors.text.message}</p>
          )}
          <label className="flex flex-col gap-1">
            Applies to
            <Input
              className="w-full font-mono text-base"
              {...form.register("paths.0")}
            />
          </label>
          <label className="flex flex-col gap-1">
            Assumption
            <Textarea
              className="w-full text-base"
              {...form.register("assumption")}
            />
          </label>
          <p className="text-muted-foreground">
            Round {review.round}{" "}
            <span className="font-mono">{review.hash.slice(0, 12)}</span>
          </p>
          <Button type="submit" disabled={memory.pending}>
            <LoadingSwap isLoading={memory.pending}>Remember</LoadingSwap>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
