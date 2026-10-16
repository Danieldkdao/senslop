"use client";

import { useState } from "react";
import { MessageSquare, Trash2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReviewNoteForm } from "./review-note-form";
import { formatReviewLine } from "../lib/formatters";
import type { ReviewNote } from "../types";

type ReviewNotesProps = {
  notes: ReviewNote[];
  onDeleteNote: (id: string) => void | Promise<void>;
  onEditNote: (id: string, body: string) => void | Promise<void>;
  onSelectNote: (note: ReviewNote) => void;
};

export const ReviewNotes = ({
  notes,
  onDeleteNote,
  onEditNote,
  onSelectNote,
}: ReviewNotesProps) => {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const matches = notes.filter((note) =>
    `${note.path}\n${note.body}\n${note.line?.code ?? ""}\n${note.line ? formatReviewLine(note.line) : ""}`
      .toLowerCase()
      .includes(query),
  );
  return (
    <aside
      aria-label="Review notes"
      className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar text-sidebar-foreground text-base"
    >
      <header className="flex shrink-0 flex-col gap-3 border-b p-4">
        <h2 className="flex items-center gap-2 font-medium">
          <MessageSquare aria-hidden="true" className="size-4" />
          Notes
        </h2>
        <Input
          aria-label="Search notes"
          placeholder="Search notes…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="text-base"
        />
      </header>
      <div
        className="min-h-0 flex-1 overflow-auto overscroll-contain p-3"
        aria-label="Saved notes"
      >
        <div className="flex flex-col gap-3">
          {!matches.length && (
            <p className="p-1 text-muted-foreground">
              {query
                ? "No notes match your search."
                : "No notes yet. Add a note from the header or select lines in the diff."}
            </p>
          )}
          {matches.map((note) => (
            <article
              key={note.id}
              className="group flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground"
            >
              <div className="flex items-start gap-2">
                <Button
                  variant="link"
                  className="h-auto min-w-0 flex-1 whitespace-normal break-all p-0 text-left text-base font-mono justify-start"
                  onClick={() => onSelectNote(note)}
                >
                  {note.path}
                </Button>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Edit note"
                    onClick={() => setEditingId(note.id)}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete note"
                    className="text-destructive"
                    disabled={deleting !== null}
                    onClick={() => {
                      if (deleting) return;
                      setDeleting(note.id);
                      void Promise.resolve(onDeleteNote(note.id))
                        .catch(() => {})
                        .finally(() => setDeleting(null));
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
              {note.line && (
                <p className="text-muted-foreground">
                  {formatReviewLine(note.line)}
                </p>
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
                <p className="whitespace-pre-wrap wrap-break-word">
                  {note.body}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
};
