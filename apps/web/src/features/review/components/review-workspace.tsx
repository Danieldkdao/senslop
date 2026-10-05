"use client";

import type { ReactNode } from "react";
import {
  FileCode2,
  FolderOpen,
  MessageSquare,
  Sprout,
  Files,
  NotebookPen,
} from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Buddy } from "@/components/buddy";
import { UserMenu } from "@/components/user-menu";
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

type ReviewWorkspaceProps = { children: ReactNode; user: UserProfile };

const FilesPanel = () => (
  <aside
    aria-label="Review files"
    className="flex h-full min-w-0 flex-col overflow-auto bg-sidebar text-sidebar-foreground"
  >
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5 font-semibold">
      <Sprout aria-hidden="true" className="size-5 text-primary" />
      Senslop
    </div>
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
        Your review’s groups and files will appear here.
      </p>
    </div>
  </aside>
);

const NotesPanel = ({
  user,
  drawer = false,
}: {
  user: UserProfile;
  drawer?: boolean;
}) => (
  <aside
    aria-label="Review notes"
    className="flex h-full min-w-0 flex-col overflow-auto bg-sidebar text-sidebar-foreground"
  >
    <div
      className={cn(
        "flex h-14 shrink-0 items-center justify-end border-b border-border px-3",
        drawer && "pr-12",
      )}
    >
      <UserMenu user={user} />
    </div>
    <div className="flex flex-1 flex-col gap-8 p-5 py-8">
      <Buddy className="mx-auto size-24 shrink-0" />
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 font-sans text-base font-medium">
          <MessageSquare
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          Notes
        </h2>
        <p className="text-base text-muted-foreground">
          Select a file to start taking notes.
        </p>
      </div>
    </div>
  </aside>
);

export const ReviewWorkspace = ({ children, user }: ReviewWorkspaceProps) => {
  const mobile = useIsMobile(1024);

  const canvas = (
    <main aria-label="Review canvas" className="flex h-full min-w-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 text-muted-foreground md:px-5">
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
              <FilesPanel />
            </SheetContent>
          </Sheet>
        )}
        {!mobile && (
          <FileCode2 aria-hidden="true" className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">No file selected</span>
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
              <NotesPanel user={user} drawer />
            </SheetContent>
          </Sheet>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {children}
      </div>
    </main>
  );

  return (
    <div className="h-dvh overflow-hidden bg-background text-base text-foreground">
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
            <FilesPanel />
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
            <NotesPanel user={user} />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
};
