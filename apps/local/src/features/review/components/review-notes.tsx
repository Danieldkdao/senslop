"use client";

import { useState } from "react";
import { MessageSquare, Trash2, Pencil } from "lucide-react";
import { Buddy } from "@/components/buddy";
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
  onAddNote: (body: string) => void | Promise<void>;
  onDeleteNote: (id: string) => void | Promise<void>;
  onEditNote: (id: string, body: string) => void | Promise<void>;
  onSelectFile: (path: string) => void;
};

export const ReviewNotes = ({
  drawer = false,
  reviewId,
  selectedPath,
  notes,
  onAddNote,
  onDeleteNote,
  onEditNote,
  onSelectFile,
}: ReviewNotesProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <aside
      aria-label="Review notes"
      className="flex h-full min-w-0 flex-col overflow-auto bg-sidebar text-sidebar-foreground"
    >
      <div
        className={cn("flex flex-1 flex-col gap-8 p-5 py-8", drawer && "pt-14")}
      >
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
                Add a note for {selectedPath}. Notes are saved locally with this
                snapshot.
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
                className="space-y-2 rounded-lg border bg-card p-4 text-card-foreground relative group"
              >
                <Button
                  variant="link"
                  className="h-auto min-w-0 whitespace-normal break-all p-0 text-left text-base font-mono"
                  onClick={() => onSelectFile(note.path)}
                >
                  {note.path}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  aria-label="Delete note"
                  onClick={() =>
                    void Promise.resolve(onDeleteNote(note.id)).catch(() => {})
                  }
                  className="absolute right-4 top-4 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
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
                {editingId === note.id ? (
                  <ReviewNoteForm
                    initialBody={note.body}
                    submitLabel="Save note"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async ({ body }) => {
                      await onEditNote(note.id, body);
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <>
                    <p className="whitespace-pre-wrap wrap-break-word">
                      {note.body}
                    </p>
                    <Button
                      variant="ghost"
                      className="text-base"
                      onClick={() => setEditingId(note.id)}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      Edit note
                    </Button>
                  </>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};
