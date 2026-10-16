"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

const historyTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(200)
    .describe("User-facing name for a saved conversation or AI review."),
});
export type HistoryTitleSchema = z.infer<typeof historyTitleSchema>;

export const HistoryTitleForm = ({
  title,
  label = "Conversation title",
  onSave,
  onCancel,
}: {
  title: string;
  label?: string;
  onSave: (title: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const id = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<HistoryTitleSchema>({
    resolver: zodResolver(historyTitleSchema),
    defaultValues: { title },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit(async ({ title }) => {
        await onSave(title).catch(() => {});
      })}
    >
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        {...register("title")}
        aria-invalid={!!errors.title}
        aria-describedby={`${id}-error`}
      />
      <FieldError
        id={`${id}-error`}
        errors={[errors.title]}
        className="text-base"
      />
      <div className="flex gap-2">
        <Button
          className="text-base"
          disabled={isSubmitting}
          aria-label="Save title"
          aria-busy={isSubmitting}
          type="submit"
        >
          <LoadingSwap isLoading={isSubmitting}>Save title</LoadingSwap>
        </Button>
        <Button className="text-base" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
