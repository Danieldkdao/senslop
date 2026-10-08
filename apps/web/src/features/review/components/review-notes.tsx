"use client";

import { MessageSquare, Trash2 } from "lucide-react";
import { Buddy } from "@/components/buddy";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReviewNoteForm } from "./review-note-form";
import { formatReviewLine } from "../lib/formatters";
import type { ReviewNote } from "../types";

type ReviewNotesProps = {
  drawer?: boolean;
  reviewId?: string;
  selectedPath?: string;
  notes: ReviewNote[];
  onAddNote: (body: string) => void;
  onDeleteNote: (id: string) => void;
  onSelectFile: (path: string) => void;
};

export const ReviewNotes = ({
  drawer = false,
  reviewId,
  selectedPath,
  notes,
  onAddNote,
  onDeleteNote,
  onSelectFile,
}: ReviewNotesProps) => (
  <aside
    aria-label="Review notes"
    className="flex h-full min-w-0 flex-col overflow-auto bg-sidebar text-sidebar-foreground"
  >
    <div
      className={cn(
        "flex h-14 shrink-0 items-center justify-end border-b border-border px-3",
        drawer && "pr-12",
      )}
    >
      <UserMenu />
    </div>
    <div className="flex flex-1 flex-col gap-8 p-5 py-8">
      <Buddy className="mx-auto size-24 shrink-0" />
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 font-sans text-base font-medium">
          <MessageSquare
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          Notes
        </h2>
        {selectedPath ? (
          <>
            <p className="break-all text-muted-foreground">
              Add a note for {selectedPath}. Notes are kept until you refresh.
            </p>
            <ReviewNoteForm
              key={`${reviewId}:${selectedPath}`}
              onSubmit={({ body }) => onAddNote(body)}
            />
          </>
        ) : (
          <p className="text-base text-muted-foreground">
            Select a file to start taking notes.
          </p>
        )}
        <div className="space-y-3" role="log" aria-label="Review feedback">
          {notes.map((note) => (
            <article
              key={note.id}
              className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            >
              <div className="flex items-start justify-between gap-2">
                <Button
                  variant="link"
                  className="h-auto min-w-0 whitespace-normal break-all p-0 text-left text-base"
                  onClick={() => onSelectFile(note.path)}
                >
                  {note.path}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete note"
                  onClick={() => onDeleteNote(note.id)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
              {note.line && (
                <>
                  <p className="text-muted-foreground">
                    {formatReviewLine(note.line)}
                  </p>
                  <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-base">
                    {note.line.code}
                  </pre>
                </>
              )}
              <p className="whitespace-pre-wrap wrap-break-word">{note.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  </aside>
);
