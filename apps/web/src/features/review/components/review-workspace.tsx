"use client";

import { useCallback, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLivePreview } from "./live-preview-provider";
import { PreviewFiles } from "./preview-files";
import { DiffSettings } from "./diff-settings";
import { ReviewNotes } from "./review-notes";
import { FileSearchDialog } from "./file-search-dialog";
import { useReviewNavigation } from "../hooks/use-review-navigation";
import { defaultDiffSettings } from "../constants";
import type { DiffView, ReviewLine, ReviewNote } from "../types";
import { formatFileStatus, formatPreviewSource } from "../lib/formatters";
import { Files, NotebookPen, Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileIcon } from "@/components/file-icon";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type ReviewWorkspaceProps = { children: ReactNode };

const PreviewDiff = dynamic(
  () => import("./preview-diff").then((module) => module.PreviewDiff),
  {
    ssr: false,
    loading: () => (
      <p className="p-8 text-muted-foreground">Opening your diff…</p>
    ),
  },
);

export const ReviewWorkspace = ({ children }: ReviewWorkspaceProps) => {
  const mobile = useIsMobile(1024);
  const { preview } = useLivePreview();
  const [selection, setSelection] = useState<{
    id: string;
    path: string;
  } | null>(null);
  const [view, setView] = useState<DiffView>("split");
  const [settings, setSettings] = useState(defaultDiffSettings);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const reviewNotes = notes.filter((note) => note.previewId === preview?.id);
  const selectedFile =
    preview?.files.find(
      (file) => selection?.id === preview.id && file.path === selection.path,
    ) ?? preview?.files[0];
  const selectedIndex =
    preview?.files.findIndex((file) => file.path === selectedFile?.path) ?? -1;
  const selectFile = useCallback(
    (path: string) => {
      if (preview) setSelection({ id: preview.id, path });
    },
    [preview],
  );
  const { searchOpen, setSearchOpen, navigateFile } = useReviewNavigation({
    preview,
    selectedPath: selectedFile?.path,
    onSelect: selectFile,
  });
  const addNote = (body: string, line: ReviewLine | null = null) => {
    if (!preview || !selectedFile) return;
    setNotes((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        previewId: preview.id,
        path: selectedFile.path,
        body,
        line,
      },
    ]);
  };
  const deleteNote = (id: string) =>
    setNotes((current) => current.filter((note) => note.id !== id));
  const notesPanel = (drawer = false) => (
    <ReviewNotes
      drawer={drawer}
      reviewId={preview?.id}
      selectedPath={selectedFile?.path}
      notes={reviewNotes}
      onAddNote={addNote}
      onDeleteNote={deleteNote}
      onSelectFile={selectFile}
    />
  );
  const filesPanel = (
    <PreviewFiles
      preview={preview}
      selectedPath={selectedFile?.path}
      onSelect={selectFile}
    />
  );

  const canvas = (
    <main aria-label="Review canvas" className="flex h-full min-w-0 flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground md:px-5">
        {mobile && (
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open files" />
              }
            >
              <Files aria-hidden="true" className="size-5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="gap-0 overflow-hidden p-0 text-base"
            >
              <SheetTitle className="sr-only">Files</SheetTitle>
              <SheetDescription className="sr-only">
                Your review’s groups and files.
              </SheetDescription>
              {filesPanel}
            </SheetContent>
          </Sheet>
        )}
        <FileIcon fileName={selectedFile?.path ?? ""} />
        <span className="min-w-0 flex-1 truncate text-foreground">
          {selectedFile?.path ?? "No file selected"}
        </span>
        {selectedFile && (
          <div className="flex shrink-0 gap-1" aria-label="Diff view">
            <Button
              variant={view === "split" ? "secondary" : "ghost"}
              aria-pressed={view === "split"}
              onClick={() => setView("split")}
            >
              Split
            </Button>
            <Button
              variant={view === "unified" ? "secondary" : "ghost"}
              aria-pressed={view === "unified"}
              onClick={() => setView("unified")}
            >
              Unified
            </Button>
            <DiffSettings settings={settings} onChange={setSettings} />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Find a file"
              aria-keyshortcuts="Meta+K Control+K"
              title="Find a file · ⌘K / Ctrl+K"
              onClick={() => setSearchOpen(true)}
            >
              <Search aria-hidden="true" className="size-5" />
            </Button>
          </div>
        )}
        {mobile && (
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open notes" />
              }
            >
              <NotebookPen aria-hidden="true" className="size-5" />
            </SheetTrigger>
            <SheetContent
              side="right"
              className="gap-0 overflow-hidden p-0 text-base"
            >
              <SheetTitle className="sr-only">Notes and account</SheetTitle>
              <SheetDescription className="sr-only">
                Review notes and your account menu.
              </SheetDescription>
              {notesPanel(true)}
            </SheetContent>
          </Sheet>
        )}
      </header>
      {preview && (
        <div className="space-y-3 border-b bg-card px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {formatPreviewSource(preview.source.kind)}
              </p>
              <p className="mt-1 text-muted-foreground">
                {preview.source.base.slice(0, 8)} →{" "}
                {preview.source.head?.slice(0, 8) ?? "working tree"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                aria-label="Previous file"
                disabled={selectedIndex <= 0}
                onClick={() => navigateFile(-1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                aria-label="Next file"
                disabled={
                  selectedIndex < 0 || selectedIndex >= preview.files.length - 1
                }
                onClick={() => navigateFile(1)}
              >
                Next
              </Button>
            </div>
          </div>
          {selectedFile && (
            <p className="flex flex-wrap gap-x-4 text-muted-foreground">
              <span>{formatFileStatus(selectedFile.status)}</span>
              {selectedFile.oldPath &&
                selectedFile.oldPath !== selectedFile.path && (
                  <span className="break-all">From {selectedFile.oldPath}</span>
                )}
              <span className="text-primary">
                +{selectedFile.added} additions
              </span>
              <span className="text-destructive">
                −{selectedFile.deleted} deletions
              </span>
            </p>
          )}
          {preview.error && (
            <p role="alert" className="text-destructive">
              {preview.error} Received files below may be incomplete.
            </p>
          )}
          {preview.excluded.length > 0 && (
            <details className="text-muted-foreground">
              <summary className="cursor-pointer">
                {preview.excluded.length} excluded files
              </summary>
              <ul className="mt-2 space-y-1">
                {preview.excluded.map((file) => (
                  <li key={file.path} className="break-all">
                    {file.path}: {file.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {preview ? (
          selectedFile ? (
            <PreviewDiff
              key={`${preview.id}:${selectedFile.path}`}
              file={selectedFile}
              view={view}
              settings={settings}
              notes={reviewNotes.filter(
                (note) => note.path === selectedFile.path,
              )}
              onAddComment={addNote}
              onDeleteNote={deleteNote}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
              Receiving your selected changes…
            </div>
          )
        ) : (
          children
        )}
      </div>
    </main>
  );

  return (
    <div className="h-dvh overflow-hidden bg-background text-base text-foreground">
      {preview && (
        <FileSearchDialog
          key={preview.id}
          open={searchOpen}
          onOpenChange={setSearchOpen}
          files={preview.files}
          selectedPath={selectedFile?.path}
          onSelect={selectFile}
        />
      )}
      {mobile ? (
        canvas
      ) : (
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            id="review-files"
            defaultSize="20%"
            minSize="14%"
            maxSize="32%"
          >
            {filesPanel}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label="Resize files panel"
            className="data-[separator=hover]:bg-primary/50 data-[separator=active]:bg-primary"
          />
          <ResizablePanel id="review-canvas" defaultSize="58%" minSize="35%">
            {canvas}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label="Resize notes panel"
            className="data-[separator=hover]:bg-primary/50 data-[separator=active]:bg-primary"
          />
          <ResizablePanel
            id="review-notes"
            defaultSize="22%"
            minSize="16%"
            maxSize="32%"
          >
            {notesPanel()}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
};
