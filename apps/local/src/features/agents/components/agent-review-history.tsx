"use client";

import { matchesJobSnapshot } from "../lib/job-snapshots";
import type { LivePreview } from "../../review/types";
import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { useAgentHistory } from "../hooks/use-agent-state";
import { formatJobStatus, formatReviewName } from "../lib/formatters";
import type { AgentActionSchema, JobSchema } from "../schemas";
import { HistoryTitleForm } from "./history-title-form";

export const AgentReviewHistory = ({
  open,
  onOpenChange,
  snapshotId,
  snapshot,
  reviews,
  onSelect,
  onAction,
  onDelete,
  onRename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshotId?: string;
  snapshot?: LivePreview | null;
  reviews: JobSchema[];
  onSelect: (job: JobSchema) => void;
  onAction: (action: AgentActionSchema) => Promise<unknown>;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) => {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<JobSchema | null>(null);
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  const history = useAgentHistory(snapshotId, "reviews", open, search);
  const savedReviews =
    history.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => "kind" in item) ?? reviews;
  const { confirm, ConfirmationDialog } = useConfirm(
    "Delete this AI review?",
    "This permanently removes the saved AI result. Your change snapshot, notes, and conversations are retained.",
  );
  const remove = async (job: JobSchema) => {
    if (deleting.current) return;
    deleting.current = true;
    setBusy(true);
    try {
      if (!(await confirm())) return;
      await onAction({ action: "delete-review", id: job.id });
      onDelete(job.id);
    } catch {
      // The action reports failures through the shared toast system.
    } finally {
      deleting.current = false;
      setBusy(false);
    }
  };
  return (
    <CommandDialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) setEditing(null);
      }}
      title="Saved AI reviews"
      description="Reviews are saved with this change snapshot."
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Find a review…"
          className="text-base"
        />
        <CommandList>
          <CommandEmpty>No saved reviews.</CommandEmpty>
          {savedReviews.map((job) => {
            const title = formatReviewName(job);
            const running = job.status === "queued" || job.status === "running";
            return (
              <CommandItem
                key={job.id}
                value={`${title} ${job.id} ${job.status}`}
                className="p-3 text-base bg-transparent! data-[selected=true]:bg-muted! [&>svg:last-child]:hidden"
                disabled={busy}
                onSelect={() => {
                  onSelect(job);
                  onOpenChange(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {title} — {formatJobStatus(job.status)}
                  {snapshot && !matchesJobSnapshot(job, snapshot) && (
                    <span className="block text-muted-foreground">
                      Older round
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Rename review ${title}`}
                  disabled={busy}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(job);
                  }}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete review ${title}`}
                  disabled={busy || running}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void remove(job);
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </CommandItem>
            );
          })}
        </CommandList>
        {history.error && (
          <p role="alert" className="p-3">
            {history.error.message}
            <Button
              className="text-base"
              onClick={() => void history.refetch()}
            >
              Retry
            </Button>
          </p>
        )}
        {history.hasNextPage && (
          <Button
            className="text-base"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            <LoadingSwap isLoading={history.isFetchingNextPage}>
              Load more reviews
            </LoadingSwap>
          </Button>
        )}
      </Command>
      <Dialog
        open={!!editing}
        onOpenChange={(value) => {
          if (!value) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename review</DialogTitle>
            <DialogDescription>
              Choose a name to find this AI review in history.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <HistoryTitleForm
              key={editing.id}
              title={formatReviewName(editing)}
              label="Review name"
              onCancel={() => setEditing(null)}
              onSave={async (title) => {
                await onAction({
                  action: "rename-review",
                  id: editing.id,
                  title,
                });
                onRename(editing.id, title);
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {ConfirmationDialog}
    </CommandDialog>
  );
};
