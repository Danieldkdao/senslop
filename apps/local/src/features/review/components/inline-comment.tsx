"use client";

import { ReviewNoteForm } from "./review-note-form";

type InlineCommentProps = {
  onSubmit: (body: string) => void | Promise<void>;
  onCancel: () => void;
  draftKey?: string;
};

export const InlineComment = ({
  onSubmit,
  onCancel,
  draftKey,
}: InlineCommentProps) => {
  return (
    <div className="min-w-0 flex-1 font-sans p-4">
      <ReviewNoteForm
        isComment
        draftKey={draftKey}
        onSubmit={({ body }) => onSubmit(body)}
        onCancel={onCancel}
      />
    </div>
  );
};
