"use client";

import { useState } from "react";
import { FolderOpen, Search, Sprout, LoaderCircle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FileIcon } from "@/components/file-icon";
import { cn } from "@/lib/utils";
import type { LivePreview } from "../types";
import {
  formatFileStatus,
  formatFileReviewLabel,
  formatPreviewProgress,
  formatPreviewSource,
} from "../lib/formatters";

type PreviewFilesProps = {
  preview: LivePreview | null;
  selectedPath?: string;
  onSelect(path: string): void;
};

export const PreviewFiles = ({
  preview,
  selectedPath,
  onSelect,
}: PreviewFilesProps) => {
  const [search, setSearch] = useState("");
  const files =
    preview?.files.filter((file) =>
      file.path.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) ?? [];
  return (
    <aside
      aria-label="Review files"
      className="flex h-full min-w-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5 font-semibold">
        <Sprout aria-hidden="true" className="size-5 text-primary" />
        Senslop
      </div>
      {!preview ? (
        <div className="space-y-3 p-5 py-8">
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
        <>
          <div className="space-y-4 border-b p-4">
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                {formatPreviewSource(preview.source.kind)}
              </p>
              <p
                role="status"
                className="flex items-center gap-2 text-muted-foreground"
              >
                {preview.status === "receiving" && (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                )}
                {formatPreviewProgress(preview)}
              </p>
            </div>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
              />
              <Input
                aria-label="Search changed files"
                placeholder="Find a file…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9 md:text-base"
              />
            </div>
          </div>
          <nav
            aria-label="Changed files"
            className="min-h-0 flex-1 flex flex-col gap-1 overflow-auto p-2"
          >
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                aria-label={formatFileReviewLabel(
                  file.path,
                  !!preview.completedPaths?.includes(file.path),
                )}
                aria-current={file.path === selectedPath ? "true" : undefined}
                onClick={() => onSelect(file.path)}
                className={cn(
                  "preview-file-enter flex w-full shrink-0 border border-transparent items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring",
                  file.path === selectedPath && "bg-sidebar-accent",
                  preview.completedPaths?.includes(file.path) &&
                    "border-primary/40 bg-primary/10 hover:bg-primary/15",
                )}
              >
                <span className="mt-0.5 shrink-0">
                  <FileIcon fileName={file.path} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-all font-medium">
                    {file.path}
                  </span>
                  {preview.completedPaths?.includes(file.path) && (
                    <span className="flex items-center gap-1 text-primary">
                      <Check aria-hidden="true" className="size-4" />
                      Completed
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
                    <span>{formatFileStatus(file.status)}</span>
                    {file.binary ? (
                      <span>Binary</span>
                    ) : (
                      <>
                        <span className="text-primary">+{file.added}</span>
                        <span className="text-destructive">
                          −{file.deleted}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            ))}
            {!files.length && (
              <p className="p-3 text-muted-foreground">
                {preview.files.length
                  ? "No files match your search."
                  : "Waiting for the first file…"}
              </p>
            )}
          </nav>
        </>
      )}
    </aside>
  );
};
