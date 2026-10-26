"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ReviewNoteForm } from "./review-note-form";

type NoteControlsProps = {
  reviewId?: string;
  selectedPath?: string;
  onAddNote: (body: string) => Promise<void>;
};

export const NoteControls = ({
  reviewId,
  selectedPath,
  onAddNote,
}: NoteControlsProps) => {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Popover open={adding} onOpenChange={setAdding}>
        <TooltipWrapper content="Add note (N)">
          <PopoverTrigger
            disabled={!selectedPath}
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Add note"
                disabled={!selectedPath}
              />
            }
          >
            <NotebookPen className="size-5" aria-hidden="true" />
          </PopoverTrigger>
        </TooltipWrapper>
        <PopoverContent
          className="w-[min(25rem,calc(100vw-2rem))] text-base"
          align="end"
        >
          <p className="break-all font-mono text-muted-foreground">
            {selectedPath}
          </p>
          <ReviewNoteForm
            key={`${reviewId}:${selectedPath}`}
            draftKey={`note:${reviewId}:${selectedPath}`}
            onSubmit={async ({ body }) => {
              await onAddNote(body);
              setAdding(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
};
