"use client";

import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Dot, Pencil, Trash2, X } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command";
import { useConfirm } from "@/hooks/use-confirm";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedReviewSummary } from "../types";
import { formatReviewSummary, formatSnapshot } from "../lib/formatters";
import { useReviewHistory } from "../hooks/use-review-history";

const renameSchema = z.object({
  title: z.string().trim().min(1, "Enter a review name.").max(200),
});
export type RenameSchema = z.infer<typeof renameSchema>;

type ReviewHistoryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (body: object) => Promise<boolean>;
};

const ReviewHistoryItem = ({
  review,
  onAction,
  onChanged,
  onOpen,
}: {
  review: SavedReviewSummary;
  onAction: ReviewHistoryProps["onAction"];
  onChanged: () => void;
  onOpen: () => void;
}) => {
  const id = useId();
  const summary = formatReviewSummary(review);
  const [editing, setEditing] = useState(false);
  const { confirm, ConfirmationDialog } = useConfirm(
    "Delete this review?",
    "This permanently removes the snapshot, all its notes, and review progress. Your repository files are unchanged.",
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RenameSchema>({
    resolver: zodResolver(renameSchema),
    defaultValues: { title: review.title },
  });
  const act = async (body: object) => {
    setBusy(true);
    const saved = await onAction(body);
    setBusy(false);
    setFailed(!saved);
    if (saved) onChanged();
    return saved;
  };
  return (
    <>
      {ConfirmationDialog}
      <CommandItem
        value={review.id}
        disabled={busy}
        className="items-start p-3 text-base [&>svg:last-child]:hidden bg-transparent! data-[selected=true]:bg-muted!"
        onSelect={() => {
          if (!editing)
            void act({ action: "open", id: review.id }).then((saved) => {
              if (saved) onOpen();
            });
        }}
      >
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          {editing ? (
            <form
              noValidate
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className="flex gap-2"
              onSubmit={handleSubmit(async ({ title }) => {
                if (
                  await act({
                    action: "change",
                    id: review.id,
                    change: { action: "rename", title },
                  })
                )
                  setEditing(false);
              })}
            >
              <label className="sr-only" htmlFor={id}>
                Review name
              </label>
              <Input
                id={id}
                autoFocus
                {...register("title")}
                className="text-base min-w-0"
                aria-invalid={!!errors.title}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Save review name"
                disabled={busy}
              >
                <LoadingSwap isLoading={busy}>
                  <Check aria-hidden="true" />
                </LoadingSwap>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cancel rename"
                onClick={() => setEditing(false)}
              >
                <X aria-hidden="true" />
              </Button>
              {errors.title && <p role="alert">{errors.title.message}</p>}
            </form>
          ) : (
            <p className="font-medium wrap-break-word">{review.title}</p>
          )}
          <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
            <span>{summary.round}</span>
            <Dot aria-hidden="true" className="size-4 shrink-0" />
            <span>{summary.date}</span>
            <Dot aria-hidden="true" className="size-4 shrink-0" />
            <span>{summary.files}</span>
            <Dot aria-hidden="true" className="size-4 shrink-0" />
            <span>{summary.notes}</span>
            <Dot aria-hidden="true" className="size-4 shrink-0" />
            <span>{summary.completed}</span>
          </p>
          <p className="text-muted-foreground font-mono">
            {formatSnapshot(review.hash)}
          </p>
          {failed && (
            <p role="alert" className="text-destructive">
              Local operation failed. Retry; your saved data is retained.
            </p>
          )}
        </div>
        <div
          className="flex shrink-0 gap-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Rename ${review.title}`}
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${review.title}`}
            disabled={busy}
            onClick={() =>
              void (async () => {
                if (await confirm())
                  await act({ action: "delete", id: review.id });
              })()
            }
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </CommandItem>
    </>
  );
};

export const ReviewHistory = ({
  open,
  onOpenChange,
  onAction,
}: ReviewHistoryProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const history = useReviewHistory(search, open);
  const reviews = history.data ?? [];
  const loading =
    history.isPending || history.isFetching || history.isDebouncing;
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Saved reviews"
      description="Search reviews saved for this repository on this computer."
      className="sm:max-w-2xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          ref={inputRef}
          maxLength={200}
          aria-label="Search saved reviews"
          placeholder="Search saved reviews…"
          className="text-base"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-[65dvh]">
          {history.error && !history.isFetching && !history.isDebouncing ? (
            <div role="alert" className="p-4">
              <p>{history.error.message}</p>
              <Button variant="outline" onClick={() => void history.refetch()}>
                Retry history
              </Button>
            </div>
          ) : loading ? (
            <p role="status" className="p-4 text-muted-foreground">
              Searching local reviews…
            </p>
          ) : reviews.length ? (
            reviews.map((review) => (
              <ReviewHistoryItem
                key={`${review.id}:${review.updatedAt}`}
                review={review}
                onAction={onAction}
                onChanged={() => {
                  void history.invalidate();
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                onOpen={() => onOpenChange(false)}
              />
            ))
          ) : (
            <p className="p-6 text-muted-foreground">No saved reviews found.</p>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
};
