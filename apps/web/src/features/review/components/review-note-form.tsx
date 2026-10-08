"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field";
import { reviewNoteSchema, type ReviewNoteSchema } from "../schemas";

type ReviewNoteFormProps = {
  onSubmit: (note: ReviewNoteSchema) => void;
  isComment?: boolean;
  onCancel?: () => void;
};

export const ReviewNoteForm = ({
  onSubmit,
  isComment = false,
  onCancel,
}: ReviewNoteFormProps) => {
  const id = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReviewNoteSchema>({
    resolver: zodResolver(reviewNoteSchema),
    defaultValues: {
      body: "",
    },
  });
  const submit = (note: ReviewNoteSchema) => {
    onSubmit(note);
    reset();
  };
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-3">
      <div className="space-y-2">
        <label htmlFor={`${id}-body`} className={cn(isComment && "sr-only")}>
          {isComment ? "Comment" : "Note"}
        </label>
        <Textarea
          id={`${id}-body`}
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
        />
        <FieldError
          id={`${id}-body-error`}
          className="text-base"
          errors={[errors.body]}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          className={cn(isComment && "h-8")}
          disabled={isSubmitting}
        >
          <LoadingSwap isLoading={isSubmitting}>
            {isComment ? "Comment" : "Add note"}
          </LoadingSwap>
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            className={cn(isComment && "h-8")}
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
