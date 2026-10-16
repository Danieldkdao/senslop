"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field";
import { reviewNoteSchema, type ReviewNoteSchema } from "../schemas";

type ReviewNoteFormProps = {
  onSubmit: (note: ReviewNoteSchema) => void | Promise<void>;
  isComment?: boolean;
  initialBody?: string;
  submitLabel?: string;
  onCancel?: () => void | Promise<void>;
};

export const ReviewNoteForm = ({
  onSubmit,
  isComment = false,
  initialBody = "",
  submitLabel,
  onCancel,
}: ReviewNoteFormProps) => {
  const id = useId();
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReviewNoteSchema>({
    resolver: zodResolver(reviewNoteSchema),
    defaultValues: {
      body: initialBody,
    },
  });
  const submit = async (note: ReviewNoteSchema) => {
    setSaveError(null);
    try {
      await onSubmit(note);
      reset();
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };
  return (
    <form
      noValidate
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-body`} className={cn(isComment && "sr-only")}>
          {isComment ? "Comment" : "Note"}
        </label>
        <Textarea
          id={`${id}-body`}
          disabled={isSubmitting}
          className={cn(
            "text-base md:text-base",
            isComment ? "min-h-16" : "min-h-24",
          )}
          placeholder={
            isComment ? "Leave a comment" : "What would you like to change?"
          }
          autoFocus={isComment}
          aria-invalid={!!errors.body}
          aria-describedby={errors.body ? `${id}-body-error` : undefined}
          {...register("body")}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!isSubmitting) event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <FieldError
          id={`${id}-body-error`}
          className="text-base"
          errors={[errors.body]}
        />
      </div>
      {saveError && (
        <p role="alert" className="text-base text-destructive">
          {saveError} Your draft is retained; submit again to retry.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          className={cn("text-base", isComment && "h-8")}
          disabled={isSubmitting}
        >
          <LoadingSwap isLoading={isSubmitting}>
            {submitLabel ?? (isComment ? "Comment" : "Add note")}
          </LoadingSwap>
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            className={cn("text-base", isComment && "h-8")}
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};
