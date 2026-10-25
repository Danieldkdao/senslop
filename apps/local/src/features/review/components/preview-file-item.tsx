"use client";

import { Check } from "lucide-react";
import type { PreviewFileSchema } from "@senslop/contracts";
import { FileIcon } from "@/components/file-icon";
import { cn } from "@/lib/utils";
import { formatFileStatus, formatFileReviewLabel } from "../lib/formatters";

export const PreviewFileItem = ({
  file,
  completed,
  selected,
  onSelect,
}: {
  file: PreviewFileSchema;
  completed: boolean;
  selected: boolean;
  onSelect: (path: string) => void;
}) => (
  <button
    type="button"
    aria-label={formatFileReviewLabel(file.path, completed)}
    aria-current={selected ? "true" : undefined}
    onClick={() => onSelect(file.path)}
    className={cn(
      "cursor-pointer preview-file-enter flex w-full shrink-0 border border-transparent items-start gap-3 leading-6 rounded-lg px-3 py-3 text-left text-base transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring",
      selected && "bg-sidebar-accent",
      completed && "border-success/40 bg-success/10 hover:bg-success/15",
    )}
  >
    <span className="flex h-lh shrink-0 items-center">
      {completed ? (
        <Check aria-hidden="true" className="size-5 text-success" />
      ) : (
        <FileIcon fileName={file.path} />
      )}
    </span>
    <span className="min-w-0 flex-1 flex flex-col gap-1">
      <span
        className={cn(
          "block break-all font-mono font-medium",
          completed && "text-success",
        )}
      >
        {file.path}
      </span>
      <span className="flex flex-wrap gap-x-3 text-muted-foreground">
        <span>{formatFileStatus(file.status)}</span>
        {file.binary ? (
          <span>Binary</span>
        ) : (
          <>
            <span className="text-primary">+{file.added}</span>
            <span className="text-destructive">−{file.deleted}</span>
          </>
        )}
      </span>
    </span>
  </button>
);
