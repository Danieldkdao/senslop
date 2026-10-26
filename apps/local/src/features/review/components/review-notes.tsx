"use client";

import { RememberDecision } from "../../memory/components/remember-decision";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { useSavedState } from "../../usability/hooks/use-saved-state";

import { useState } from "react";
import { Dot, MessageSquare, Trash2, Pencil } from "lucide-react";
import { FileIcon } from "@/components/file-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReviewNoteForm } from "./review-note-form";
import { formatReviewLine } from "../lib/formatters";
import type { ReviewNote } from "../types";

type ReviewNotesProps = {
  notes: ReviewNote[];
  review?: ReviewIdentitySchema | null;
  onDeleteNote: (id: string) => void | Promise<void>;
  onEditNote: (id: string, body: string) => void | Promise<void>;
  onSelectNote: (note: ReviewNote) => void;
};

export const ReviewNotes = ({
  notes,
  review,
  onDeleteNote,
  onEditNote,
  onSelectNote,
}: ReviewNotesProps) => {
  const [search, setSearch] = useSavedState(
    `notes-search:${review?.id ?? "empty"}`,
    "",
  );
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
      <header className="flex shrink-0 flex-col">
        <h2 className="flex items-center gap-2 px-4 py-3 font-medium">
          <MessageSquare aria-hidden="true" className="size-4" />
          Notes
        </h2>
        <Input
          variant="search"
          aria-label="Search notes"
          placeholder="Search notes…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-10 w-full px-4 text-base"
        />
      </header>
      <div
        className="min-h-0 flex-1 scroll-fade-y overflow-auto overscroll-contain"
        aria-label="Saved notes"
      >
        <div className="flex flex-col">
          {!matches.length && (
            <p className="px-4 py-5 text-muted-foreground">
              {query
                ? "No notes match your search."
                : "No notes yet; add one from the header or select lines in the diff."}
            </p>
          )}
          {matches.map((note) => (
            <article
              key={note.id}
              className="group flex w-full min-w-0 flex-col gap-2 border-b p-3"
            >
              <div className="flex items-start gap-2">
                <Button
                  variant="link"
                  className="flex h-auto min-w-0 flex-1 flex-col items-start gap-2 whitespace-normal rounded-none p-0 text-left text-base justify-start hover:no-underline"
                  onClick={() => onSelectNote(note)}
                >
                  <span className="w-full whitespace-pre-wrap wrap-break-word font-medium text-foreground">
                    {note.body}
                  </span>
                  <span className="flex w-full min-w-0 flex-wrap items-center gap-1 font-mono text-base text-muted-foreground">
                    <FileIcon fileName={note.path} />
                    <span className="min-w-0 wrap-break-word font-medium">
                      {note.path}
                    </span>
                    {note.line && (
                      <>
                        <Dot aria-hidden="true" className="size-4 shrink-0" />
                        <span>{formatReviewLine(note.line)}</span>
                      </>
                    )}
                  </span>
                </Button>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                  {review && (
                    <RememberDecision
                      review={review}
                      text={note.body}
                      path={note.path}
                      originId={note.id}
                      originKind="note"
                    />
                  )}
                  <TooltipWrapper content="Edit note">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit note"
                      onClick={() => setEditingId(note.id)}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                  </TooltipWrapper>
                  <TooltipWrapper content="Delete note">
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
                  </TooltipWrapper>
                </div>
              </div>
              {editingId === note.id ? (
                <ReviewNoteForm
                  initialBody={note.body}
                  draftKey={`edit-note:${note.id}`}
                  submitLabel="Save note"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async ({ body }) => {
                    await onEditNote(note.id, body);
                    setEditingId(null);
                  }}
                />
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
};
