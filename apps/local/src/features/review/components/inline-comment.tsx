"use client";

import { ReviewNoteForm } from "./review-note-form";

type InlineCommentProps = {
  onSubmit: (body: string) => void | Promise<void>;
  onCancel: () => void;
};

export const InlineComment = ({ onSubmit, onCancel }: InlineCommentProps) => {
  return (
    <div className="min-w-0 flex-1 font-sans p-4">
      <ReviewNoteForm
        isComment
        onSubmit={({ body }) => onSubmit(body)}
        onCancel={onCancel}
      />
    </div>
  );
};
