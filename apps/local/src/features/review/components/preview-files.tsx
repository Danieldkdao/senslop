"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen } from "lucide-react";
import { GroupedFiles } from "../../agents/components/grouped-files";
import type { GroupingSchema } from "../../agents/schemas";
import type { LivePreview } from "../types";
import { PreviewFileItem } from "./preview-file-item";

type PreviewFilesProps = {
  preview: LivePreview | null;
  grouping?: GroupingSchema | null;
  preparing?: boolean;
  selectedPath?: string;
  onSelect(path: string): void;
};

export const PreviewFiles = ({
  preview,
  grouping,
  preparing = false,
  selectedPath,
  onSelect,
}: PreviewFilesProps) => {
  const files = preview?.files ?? [];
  return (
    <aside
      aria-label="Review files"
      className="flex h-full min-w-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
    >
      {preparing ? (
        <div
          role="status"
          aria-label="Waiting for grouped files"
          className="flex flex-col gap-4 p-4"
        >
          <p className="text-muted-foreground">Waiting for grouped files…</p>
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ) : !preview ? (
        <div className="flex flex-col gap-3 p-5 py-8">
          <h2 className="flex items-center gap-2 font-sans text-base font-medium">
            <FolderOpen
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            Files
          </h2>
          <p className="text-base text-muted-foreground">No files here yet</p>
          <p className="text-base text-muted-foreground">
            Your changes will appear here as they arrive.
          </p>
        </div>
      ) : (
        <nav
          aria-label="Changed files"
          className="min-h-0 flex-1 flex flex-col gap-1 overflow-auto p-2"
        >
          {grouping ? (
            <GroupedFiles
              grouping={grouping}
              preview={preview}
              search=""
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ) : (
            files.map((file) => (
              <PreviewFileItem
                key={file.path}
                file={file}
                completed={!!preview.completedPaths?.includes(file.path)}
                selected={file.path === selectedPath}
                onSelect={onSelect}
              />
            ))
          )}
          {!files.length && (
            <p className="p-3 text-muted-foreground">
              Waiting for the first file…
            </p>
          )}
        </nav>
      )}
    </aside>
  );
};
