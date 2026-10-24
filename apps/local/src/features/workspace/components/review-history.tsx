"use client";

import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Dot, FolderCheckIcon, Pencil, Trash2, X } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useConfirm } from "@/hooks/use-confirm";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { SavedReviewSummary } from "../types";
import {
  formatReviewDirectory,
  formatReviewSummary,
  formatSnapshot,
} from "../lib/formatters";
import { useReviewHistory } from "../hooks/use-review-history";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";

const renameSchema = z.object({
  title: z.string().trim().min(1, "Enter a review name.").max(200),
});
export type RenameSchema = z.infer<typeof renameSchema>;

type ReviewHistoryProps = {
  open: boolean;
  currentReviewId?: string;
  currentDirectory?: string;
  shortcutsEnabled?: boolean;
  onShortcutsEnabledChange?: (enabled: boolean) => void;
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
                    expectedHash: review.hash,
                    expectedRound: review.round ?? 1,
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
  currentReviewId,
  currentDirectory,
  shortcutsEnabled,
  onShortcutsEnabledChange,
  onOpenChange,
  onAction,
}: ReviewHistoryProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const shortcutsId = useId();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string>();
  const history = useReviewHistory(search, open);
  const reviews = history.data ?? [];
  const groups = new Map<string | null, SavedReviewSummary[]>();
  for (const review of reviews) {
    const group = groups.get(review.directory);
    if (group) group.push(review);
    else groups.set(review.directory, [review]);
  }
  const orderedGroups = [...groups].sort(([left], [right]) => {
    if (left === currentDirectory) return -1;
    if (right === currentDirectory) return 1;
    if (left === null) return 1;
    if (right === null) return -1;
    return left.localeCompare(right);
  });
  const loading =
    history.isPending || history.isFetching || history.isDebouncing;
  const selectedReview =
    selection ??
    (!search.trim() && reviews.some((review) => review.id === currentReviewId)
      ? currentReviewId
      : orderedGroups[0]?.[1][0]?.id) ??
    "";
  const changeOpen = (value: boolean) => {
    if (!value) {
      setSearch("");
      setSelection(undefined);
    }
    onOpenChange(value);
  };
  return (
    <CommandDialog
      open={open}
      onOpenChange={changeOpen}
      title="Saved reviews"
      description="Search reviews saved for this repository on this computer."
      className="sm:max-w-2xl"
    >
      <Command
        shouldFilter={false}
        value={selectedReview}
        onValueChange={setSelection}
      >
        <CommandInput
          ref={inputRef}
          maxLength={200}
          aria-label="Search saved reviews"
          placeholder="Search review names or folder paths…"
          className="text-base"
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            setSelection(undefined);
          }}
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
            orderedGroups.map(([directory, reviews]) => (
              <CommandGroup
                key={directory ?? ""}
                heading={
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="break-all font-mono">
                        {formatReviewDirectory(directory)}
                      </span>
                    </div>
                    {directory === currentDirectory && (
                      <TooltipWrapper content="Current folder">
                        <span tabIndex={0} aria-label="Current folder">
                          <FolderCheckIcon
                            className="h-[6lh]"
                            aria-hidden="true"
                          />
                        </span>
                      </TooltipWrapper>
                    )}
                  </div>
                }
                className="**:[[cmdk-group-heading]]:text-base"
              >
                {reviews.map((review) => (
                  <ReviewHistoryItem
                    key={`${review.id}:${review.updatedAt}`}
                    review={review}
                    onAction={onAction}
                    onChanged={() => {
                      void history.invalidate();
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    onOpen={() => changeOpen(false)}
                  />
                ))}
              </CommandGroup>
            ))
          ) : (
            <p className="p-6 text-muted-foreground">No saved reviews found.</p>
          )}
        </CommandList>
      </Command>
      {onShortcutsEnabledChange && (
        <div className="flex flex-col gap-2 border-t border-border p-3 text-base">
          <label
            htmlFor={shortcutsId}
            className="flex items-center justify-between gap-3"
          >
            Review keyboard shortcuts
            <Switch
              id={shortcutsId}
              checked={shortcutsEnabled}
              onCheckedChange={onShortcutsEnabledChange}
            />
          </label>
          <p className="text-muted-foreground">
            R opens this list. [ opens the previous review; ] opens the next.
          </p>
        </div>
      )}
    </CommandDialog>
  );
};
