"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLivePreview } from "./live-preview-provider";
import { PreviewFiles } from "./preview-files";
import { ReviewSettings } from "../../settings/components/review-settings";
import { ReviewNotes } from "./review-notes";
import { FileSearchDialog } from "./file-search-dialog";
import { useReviewNavigation } from "../hooks/use-review-navigation";
import { defaultDiffSettings } from "../constants";
import type { DiffView, ReviewLine } from "../types";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Files,
  NotebookPen,
  Search,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileIcon } from "@/components/file-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
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

import { WorkspaceToolbar } from "../../workspace/components/workspace-toolbar";

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
  const { preview, error, changeReview, refresh } = useLivePreview();
  const [selection, setSelection] = useState<{
    id: string;
    path: string;
  } | null>(null);
  const [view, setView] = useState<DiffView>("split");
  const [settings, setSettings] = useState(defaultDiffSettings);
  const reviewNotes = preview?.notes ?? [];
  const selectedFile =
    preview?.files.find(
      (file) => selection?.id === preview.id && file.path === selection.path,
    ) ??
    preview?.files.find((file) => file.path === preview.selectedPath) ??
    preview?.files[0];
  const selectedIndex =
    preview?.files.findIndex((file) => file.path === selectedFile?.path) ?? -1;
  const selectFile = useCallback(
    (path: string) => {
      if (preview) {
        setSelection({ id: preview.id, path });
        void changeReview({ action: "select", path }).catch(() => {});
      }
    },
    [preview, changeReview],
  );
  const completionPending = useRef(false);
  const completed =
    !!selectedFile && !!preview?.completedPaths?.includes(selectedFile.path);
  const toggleCompletion = useCallback(() => {
    if (!selectedFile || completionPending.current) return;
    completionPending.current = true;
    void changeReview({
      action: "complete",
      path: selectedFile.path,
      complete: !completed,
    })
      .catch(() => {})
      .finally(() => {
        completionPending.current = false;
      });
  }, [changeReview, selectedFile, completed]);
  const { searchOpen, setSearchOpen, navigateFile } = useReviewNavigation({
    preview,
    selectedPath: selectedFile?.path,
    onSelect: selectFile,
    onToggleCompletion: toggleCompletion,
  });
  const addNote = async (body: string, line: ReviewLine | null = null) => {
    if (!preview || !selectedFile) return;
    await changeReview({
      action: "add-note",
      note: {
        id: crypto.randomUUID(),
        previewId: preview.id,
        path: selectedFile.path,
        body,
        line,
      },
    });
  };
  const deleteNote = async (id: string) => {
    await changeReview({ action: "delete-note", id });
  };
  const editNote = async (id: string, body: string) => {
    await changeReview({ action: "edit-note", id, body });
  };
  const notesPanel = (drawer = false) => (
    <ReviewNotes
      drawer={drawer}
      reviewId={preview?.id}
      selectedPath={selectedFile?.path}
      notes={reviewNotes}
      onAddNote={addNote}
      onDeleteNote={deleteNote}
      onEditNote={editNote}
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
    <main
      aria-label="Review canvas"
      className={cn(
        "flex h-full min-w-0 flex-col",
        completed && "ring-1 ring-inset ring-primary/40",
      )}
    >
      <header
        className={cn(
          "flex min-h-14 shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground md:px-5",
          completed && "border-primary/40 bg-primary/10",
        )}
      >
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
        <div
          className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain md:max-w-[70%]"
          aria-label="Workspace controls"
        >
          {selectedFile && (
            <>
              <TooltipWrapper content="Previous file">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous file"
                  disabled={selectedIndex <= 0}
                  onClick={() => navigateFile(-1)}
                >
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Next file">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next file"
                  disabled={
                    selectedIndex < 0 ||
                    selectedIndex >= (preview?.files.length ?? 0) - 1
                  }
                  onClick={() => navigateFile(1)}
                >
                  <ArrowRight aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Toggle file completion (D)">
                <Button
                  variant={
                    preview?.completedPaths?.includes(selectedFile.path)
                      ? "secondary"
                      : "ghost"
                  }
                  size="icon"
                  aria-label={
                    preview?.completedPaths?.includes(selectedFile.path)
                      ? "Mark incomplete"
                      : "Mark complete"
                  }
                  aria-pressed={
                    preview?.completedPaths?.includes(selectedFile.path) ??
                    false
                  }
                  aria-keyshortcuts="d"
                  onClick={toggleCompletion}
                >
                  <Check aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Find a file (⌘K / Ctrl+K)">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Find a file"
                  aria-keyshortcuts="Meta+K Control+K"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
            </>
          )}
          <WorkspaceToolbar />
          <ReviewSettings
            settings={settings}
            onChange={setSettings}
            view={view}
            onViewChange={setView}
          />
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
                <SheetTitle className="sr-only">Notes</SheetTitle>
                <SheetDescription className="sr-only">
                  Review notes for this snapshot.
                </SheetDescription>
                {notesPanel(true)}
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="border-b p-4 text-destructive">
          {error}
          <Button
            variant="outline"
            onClick={() => void refresh().catch(() => {})}
          >
            Retry loading review
          </Button>
        </p>
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
