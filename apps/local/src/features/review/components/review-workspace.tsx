"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { useLivePreview } from "./live-preview-provider";
import { PreviewFiles } from "./preview-files";
import { ReviewSettings } from "../../settings/components/review-settings";
import { ReviewNotes } from "./review-notes";
import { NoteControls } from "./note-controls";
import { AgentPanel } from "../../agents/components/agent-panel";
import { FileSummary } from "../../agents/components/file-summary";
import { ReviewPreparation } from "../../agents/components/review-preparation";
import { assignedModel } from "../../agents/lib/model-selection";
import { useAiSettings } from "../../agents/hooks/use-ai-settings";
import { useGroupingCountdown } from "../../agents/hooks/use-grouping-countdown";
import { useAgentState } from "../../agents/hooks/use-agent-state";
import type { FindingSchema } from "../../agents/schemas";
import { FileSearchDialog } from "./file-search-dialog";
import { useReviewReadyToast } from "../hooks/use-review-ready-toast";
import { useReviewPreferences } from "../../settings/hooks/use-review-preferences";
import { matchesJobSnapshot } from "../../agents/lib/job-snapshots";
import { useReviewNavigation } from "../hooks/use-review-navigation";
import { useUiPreferences } from "../../settings/hooks/use-ui-preferences";
import { changedEditorPreferences } from "../../settings/lib/ui-preferences";
import { panelPreferencesSchema } from "../../settings/schemas";
import type { ReviewLine } from "../types";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Files,
  Bot,
  Search,
  ListRestart,
  CheckIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileIcon } from "@/components/file-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { LoadingSwap } from "@/components/ui/loading-swap";
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
  const {
    preview,
    error,
    changeReview,
    refresh,
    discardReview,
    reviewOperation,
    trackReviewOperation,
  } = useLivePreview();
  const [selection, setSelection] = useState<{
    id: string;
    path: string;
  } | null>(null);
  const agents = useAgentState(preview?.id);
  const { preferences } = useReviewPreferences();
  const ui = useUiPreferences();
  const settings = ui.values.editor;
  const view = ui.values.view;
  const panelGroup = useRef<{
    getLayout: () => Record<string, number>;
    setLayout: (layout: Record<string, number>) => Record<string, number>;
  } | null>(null);
  const panelsRestored = useRef(false);
  useEffect(() => {
    if (!ui.preferences.data || !panelGroup.current || panelsRestored.current)
      return;
    panelsRestored.current = true;
    if (ui.values.panels) panelGroup.current.setLayout(ui.values.panels);
  }, [ui.preferences.data, ui.values.panels, mobile]);
  const { settings: aiSettings } = useAiSettings();
  const groupingConfigured = !!assignedModel(aiSettings.data, "grouping");
  const groupingJobs =
    agents.state.data?.jobs.filter(
      (job) =>
        job.kind === "grouping" &&
        !!preview &&
        matchesJobSnapshot(job, preview),
    ) ?? [];
  const groupingCountdown = useGroupingCountdown(groupingJobs[0]);
  const groupingRun =
    groupingJobs[0]?.status === "completed" ? groupingJobs[0] : null;
  const grouping =
    preview?.groupingEnabled !== false &&
    groupingRun?.result &&
    "groups" in groupingRun.result
      ? groupingRun.result
      : null;
  const preparing =
    !!preview?.files.length &&
    preview.groupingEnabled !== false &&
    !grouping &&
    !groupingCountdown.fallbackReady &&
    (aiSettings.isPending || groupingConfigured);
  const orderedFiles = grouping
    ? grouping.groups
        .flatMap((group) => group.files)
        .flatMap(
          (member) =>
            preview?.files.find((file) => file.path === member.path) ?? [],
        )
    : (preview?.files ?? []);
  const orderedPreview = preview ? { ...preview, files: orderedFiles } : null;
  const [evidence, setEvidence] = useState<Pick<
    FindingSchema,
    "path" | "side" | "start" | "end"
  > | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initialSettingsSection, setInitialSettingsSection] =
    useState<string>();
  const reviewNotes = preview?.notes ?? [];
  const selectedFile =
    preview?.files.find(
      (file) => selection?.id === preview.id && file.path === selection.path,
    ) ??
    preview?.files.find((file) => file.path === preview.selectedPath) ??
    preview?.files[0];
  useReviewReadyToast({
    snapshotId: preview?.id,
    hash: preview?.hash,
    round: preview?.round,
    jobs: agents.state.data?.jobs ?? [],
    requestedJobs: agents.requestedJobs,
    operation: reviewOperation,
    onHandled: () => trackReviewOperation(null),
    ready:
      !!preview &&
      !error &&
      !preparing &&
      orderedFiles.length === preview.files.length &&
      new Set(orderedFiles.map((file) => file.path)).size ===
        preview.files.length &&
      (preview.groupingEnabled === false ||
        !!grouping ||
        groupingCountdown.fallbackReady),
  });
  const selectedIndex =
    orderedFiles.findIndex((file) => file.path === selectedFile?.path) ?? -1;
  const selectFile = useCallback(
    (path: string) => {
      if (preview?.files.some((file) => file.path === path)) {
        setSelection({ id: preview.id, path });
        setEvidence(null);
        void changeReview({ action: "select", path }).catch(() => {});
      }
    },
    [preview, changeReview],
  );
  const completionPending = useRef(new Set<string>());
  const latestSelection = useRef({
    id: preview?.id,
    hash: preview?.hash,
    round: preview?.round,
    path: selectedFile?.path,
  });
  useEffect(() => {
    latestSelection.current = {
      id: preview?.id,
      hash: preview?.hash,
      round: preview?.round,
      path: selectedFile?.path,
    };
  }, [preview?.id, preview?.hash, preview?.round, selectedFile?.path]);
  const completed =
    !!selectedFile && !!preview?.completedPaths?.includes(selectedFile.path);
  const nextFile = orderedFiles[selectedIndex + 1];
  const toggleCompletion = useCallback(() => {
    if (!selectedFile) return;
    const key = JSON.stringify([
      preview?.id,
      preview?.hash,
      preview?.round,
      selectedFile.path,
    ]);
    if (completionPending.current.has(key)) return;
    completionPending.current.add(key);
    void changeReview({
      action: "complete",
      path: selectedFile.path,
      complete: !completed,
    })
      .then(() => {
        const current = latestSelection.current;
        if (
          !completed &&
          preferences.data?.autoAdvance &&
          nextFile &&
          current.id === preview?.id &&
          current.hash === preview?.hash &&
          current.round === preview?.round &&
          current.path === selectedFile.path
        )
          selectFile(nextFile.path);
      })
      .catch(() => {})
      .finally(() => {
        completionPending.current.delete(key);
      });
  }, [
    changeReview,
    selectedFile,
    completed,
    preferences.data?.autoAdvance,
    nextFile,
    preview?.id,
    preview?.hash,
    preview?.round,
    selectFile,
  ]);
  const { searchOpen, setSearchOpen, navigateFile } = useReviewNavigation({
    preview: preparing ? null : orderedPreview,
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
  const agentPanel = (
    <AgentPanel
      snapshot={preview}
      key={preview?.id ?? "empty"}
      snapshotId={preview?.id}
      snapshotFingerprint={
        preview?.source.kind === "working-tree"
          ? preview.fingerprint
          : undefined
      }
      requireFreshSnapshot={preview?.source.kind === "working-tree"}
      hasChanges={!!preview?.files.length}
      preparing={preparing}
      agents={agents}
      onEvidence={(finding) => {
        selectFile(finding.path);
        setEvidence({ ...finding });
      }}
    />
  );
  const filesPanel = (
    <ResizablePanelGroup orientation="vertical" className="min-h-0">
      <ResizablePanel defaultSize="50%" minSize="20%">
        <PreviewFiles
          preview={preview}
          grouping={grouping}
          preparing={preparing}
          selectedPath={selectedFile?.path}
          onSelect={selectFile}
        />
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Resize files and notes" />
      <ResizablePanel defaultSize="50%" minSize="20%">
        <ReviewNotes
          key={preview?.id ?? "empty"}
          notes={reviewNotes}
          onDeleteNote={deleteNote}
          onEditNote={editNote}
          onSelectNote={(note) => {
            selectFile(note.path);
            if (note.line)
              setEvidence({
                path: note.path,
                side: note.line.side === "additions" ? "after" : "before",
                start: note.line.lineNumber,
                end: note.line.endLineNumber ?? note.line.lineNumber,
              });
          }}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  const canvas = (
    <main
      aria-label="Review canvas"
      className={cn(
        "flex h-full min-w-0 flex-col",
        !preparing && completed && "ring-1 ring-inset ring-primary/40",
      )}
    >
      <header
        className={cn(
          "flex min-h-14 shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground md:px-5",
          !preparing && completed && "border-primary/40 bg-primary/10",
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
        {completed && !preparing ? (
          <CheckIcon className="size-5 text-success" />
        ) : (
          <FileIcon fileName={preparing ? "" : (selectedFile?.path ?? "")} />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            completed && !preparing ? "text-success" : "text-foreground",
          )}
        >
          {preparing
            ? "Preparing review…"
            : (selectedFile?.path ?? "No file selected")}
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
                  disabled={preparing || selectedIndex <= 0}
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
                    preparing ||
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
                  disabled={preparing}
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
                  disabled={preparing}
                  onClick={() => setSearchOpen(true)}
                >
                  <Search aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
            </>
          )}
          {preview && preview.groupingEnabled !== false && (
            <TooltipWrapper
              content={grouping ? "Regroup changes" : "Group changes"}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label={grouping ? "Regroup changes" : "Group changes"}
                disabled={
                  !groupingConfigured ||
                  groupingJobs[0]?.status === "queued" ||
                  groupingJobs[0]?.status === "running"
                }
                onClick={() =>
                  void agents
                    .act({
                      action: "job",
                      snapshotId: preview.id,
                      kind: "grouping",
                    })
                    .catch(() => {})
                }
              >
                <LoadingSwap
                  isLoading={
                    groupingJobs[0]?.status === "queued" ||
                    groupingJobs[0]?.status === "running"
                  }
                >
                  <ListRestart aria-hidden="true" className="size-5" />
                </LoadingSwap>
              </Button>
            </TooltipWrapper>
          )}
          <NoteControls
            reviewId={preview?.id}
            selectedPath={preparing ? undefined : selectedFile?.path}
            onAddNote={addNote}
          />
          <WorkspaceToolbar preparing={preparing} />
          <ReviewSettings
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            initialSection={initialSettingsSection}
            settings={settings}
            onChange={(next) => {
              const editor = changedEditorPreferences(settings, next);
              if (Object.keys(editor).length) ui.save({ editor });
            }}
            view={view}
            onViewChange={(next) => ui.save({ view: next })}
            onApplicationThemeChange={(applicationTheme) =>
              ui.save({ applicationTheme })
            }
            preferencesLoading={ui.preferences.isPending}
            preferencesError={ui.preferences.error?.message}
            onRetryPreferences={() => void ui.preferences.refetch()}
          />
          {mobile && (
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open agents"
                  />
                }
              >
                <Bot aria-hidden="true" className="size-5" />
              </SheetTrigger>
              <SheetContent
                side="right"
                className="gap-0 overflow-hidden p-0 text-base"
              >
                <SheetTitle className="sr-only">Agents</SheetTitle>
                <SheetDescription className="sr-only">
                  Chat and saved AI reviews for this snapshot.
                </SheetDescription>
                {agentPanel}
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
      {!preparing && selectedFile && (
        <FileSummary
          key={`${preview?.id}:${selectedFile.path}`}
          file={selectedFile}
          grouping={grouping}
          onSelect={selectFile}
        />
      )}
      <div
        data-review-scroll
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        {preparing ? (
          <ReviewPreparation
            job={groupingJobs[0]}
            remainingSeconds={groupingCountdown.seconds}
            error={
              agents.state.error?.message ??
              aiSettings.error?.message ??
              undefined
            }
            configured={groupingConfigured}
            onRetry={() =>
              agents.act({
                action: "job",
                snapshotId: preview!.id,
                kind: "grouping",
              })
            }
            onConfigure={() => {
              setInitialSettingsSection("ai");
              setSettingsOpen(true);
            }}
            onStop={(id) => agents.act({ action: "cancel", id })}
            onDiscard={discardReview}
          />
        ) : preview ? (
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
              snapshotId={preview.id}
              evidence={evidence?.path === selectedFile.path ? evidence : null}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
              {preview.status === "receiving"
                ? "Receiving your selected changes…"
                : "No changes remain in this review. Re-sync after making more edits or start a new review."}
            </div>
          )
        ) : (
          children
        )}
      </div>
    </main>
  );

  return (
    <div className="fixed inset-0 overflow-clip bg-background text-base text-foreground">
      {preview && (
        <FileSearchDialog
          key={preview.id}
          open={searchOpen && !preparing}
          onOpenChange={setSearchOpen}
          files={preview.files}
          grouping={grouping}
          selectedPath={selectedFile?.path}
          onSelect={selectFile}
        />
      )}
      {mobile ? (
        canvas
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          groupRef={panelGroup}
          defaultLayout={ui.values.panels ?? undefined}
          disabled={ui.preferences.isPending || !!ui.preferences.error}
          onLayoutChanged={(layout, meta) => {
            if (!meta.isUserInteraction || !ui.preferences.data) return;
            const parsed = panelPreferencesSchema.safeParse(
              meta.requestedLayout ?? layout,
            );
            if (parsed.success) ui.save({ panels: parsed.data });
          }}
        >
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
          <ResizablePanel id="review-canvas" defaultSize="52%" minSize="35%">
            {canvas}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label="Resize agents panel"
            className="data-[separator=hover]:bg-primary/50 data-[separator=active]:bg-primary"
          />
          <ResizablePanel
            id="review-agents"
            defaultSize="28%"
            minSize="22%"
            maxSize="42%"
          >
            {agentPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
};
