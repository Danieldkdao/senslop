"use client";

import { NotificationListener } from "../../notifications/components/notification-listener";

import { formatWhitespaceMode } from "../lib/formatters";

import {
  useSourceExplorer,
  useFrozenSource,
} from "../../precision/hooks/use-source-explorer";
import { useReadingTrail } from "../../precision/hooks/use-reading-trail";
import { StructuredDiffPreview } from "../../precision/components/structured-diff-preview";
import { ChangeImpactPanel } from "../../precision/components/change-impact-panel";
import type { SourceLocationSchema } from "../../precision/schemas";
import { Undo2, Redo2, X } from "lucide-react";
import {
  useCallback,
  useMemo,
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
import { useReviewPrecision } from "../../precision/hooks/use-review-precision";
import { ProjectSwitcher } from "../../workspace/components/project-switcher";
import { useWorkspaceBuddy } from "../../buddy/hooks/use-workspace-buddy";

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
    unitId?: string;
  } | null>(null);
  const precision = useReviewPrecision(
    preview?.hash && preview.round
      ? { id: preview.id, hash: preview.hash, round: preview.round }
      : null,
  );
  const organization = precision.state.data;
  const identity = useMemo(
    () =>
      preview?.hash && preview.round
        ? { id: preview.id, hash: preview.hash, round: preview.round }
        : null,
    [preview],
  );
  const trail = useReadingTrail(
    `${preview?.id}:${preview?.hash}:${preview?.round}`,
  );
  const [contextLocation, setContextLocation] = useState<
    (SourceLocationSchema & { reviewId: string; revisionKey: string }) | null
  >(null);
  const activeContext =
    contextLocation?.reviewId === preview?.id &&
    contextLocation?.revisionKey === `${preview?.hash}:${preview?.round}`
      ? contextLocation
      : null;
  const frozenSource = useFrozenSource(identity, activeContext);
  const readingScroll = useRef<HTMLDivElement>(null);

  const [fullFile, setFullFile] = useState(false);
  const [regionContext, setRegionContext] = useState(0);
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
  useWorkspaceBuddy({
    preview,
    jobs: agents.state.data?.jobs ?? [],
    jobsLoaded: !!agents.state.data,
    grouping,
    error,
    requestedJobs: agents.requestedJobs,
    operation: reviewOperation,
  });
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
    (path: string, unitId?: string) => {
      if (preview?.files.some((file) => file.path === path)) {
        unitId ??=
          organization?.units.find(
            (unit) => unit.path === path && !unit.reviewed,
          )?.id ?? organization?.units.find((unit) => unit.path === path)?.id;
        trail.visit(
          { path, side: "after", unitId },
          readingScroll.current?.scrollTop ?? 0,
        );
        setContextLocation(null);
        setSelection({ id: preview.id, path, unitId });
        setEvidence(null);
        void changeReview({ action: "select", path }).catch(() => {});
      }
    },
    [preview, changeReview, trail, organization],
  );
  const selectedUnit =
    organization?.units.find(
      (unit) =>
        unit.path === selectedFile?.path && unit.id === selection?.unitId,
    ) ?? organization?.units.find((unit) => unit.path === selectedFile?.path);
  const explorerSide =
    activeContext?.side ??
    (selectedUnit?.ranges.some((range) => range.side === "before") &&
    !selectedUnit.ranges.some((range) => range.side === "after")
      ? "before"
      : "after");
  const explorer = useSourceExplorer(identity, explorerSide);
  const otherSide = explorerSide === "after" ? "before" : "after";
  const otherExplorer = useSourceExplorer(
    organization?.units.some((unit) =>
      unit.ranges.some((range) => range.side === otherSide),
    )
      ? identity
      : null,
    otherSide,
  );
  const impacts = useMemo(() => {
    const combined = new Map(
      (explorer.data?.impact ?? []).map((impact) => [impact.unitId, impact]),
    );
    for (const impact of otherExplorer.data?.impact ?? []) {
      const existing = combined.get(impact.unitId);
      combined.set(
        impact.unitId,
        existing
          ? {
              ...existing,
              reasons: [...new Set([...existing.reasons, ...impact.reasons])],
              limitations: [
                ...new Set([...existing.limitations, ...impact.limitations]),
              ],
              relationships: [
                ...new Map(
                  [...existing.relationships, ...impact.relationships].map(
                    (relationship) => [
                      JSON.stringify(relationship),
                      relationship,
                    ],
                  ),
                ).values(),
              ],
            }
          : impact,
      );
    }
    return [...combined.values()];
  }, [explorer.data?.impact, otherExplorer.data?.impact]);
  const orderedUnits = useMemo(
    () =>
      organization?.flows.flatMap((flow) =>
        flow.unitIds.flatMap(
          (id) => organization.units.find((unit) => unit.id === id) ?? [],
        ),
      ) ?? [],
    [organization],
  );
  const selectedUnitIndex = orderedUnits.findIndex(
    (unit) => unit.id === selectedUnit?.id,
  );
  const selectUnit = (id: string) => {
    const unit = organization?.units.find((item) => item.id === id);
    if (unit) selectFile(unit.path, unit.id);
  };
  const navigateUnit = organization
    ? (direction: -1 | 1) => {
        const unit = orderedUnits[selectedUnitIndex + direction];
        if (unit) selectFile(unit.path, unit.id);
      }
    : undefined;
  useEffect(() => {
    if (trail.ready && !trail.current && selectedFile)
      trail.visit(
        { path: selectedFile.path, side: "after", unitId: selectedUnit?.id },
        0,
      );
  }, [trail, selectedFile, selectedUnit?.id]);
  const openSource = (location: SourceLocationSchema) => {
    if (!preview) return;
    trail.visit(
      { ...location, context: true },
      readingScroll.current?.scrollTop ?? 0,
    );
    setContextLocation({
      ...location,
      reviewId: preview.id,
      revisionKey: `${preview.hash}:${preview.round}`,
    });
  };
  const restoreLocation = useCallback(
    (
      location:
        | (SourceLocationSchema & { scrollTop: number; context?: boolean })
        | null
        | undefined,
    ) => {
      if (!location || !preview) return;
      const key = `${preview.id}:${preview.hash}:${preview.round}:${location.path}:${location.unitId ?? "file"}:${location.context ? location.side : "diff"}`;
      sessionStorage.setItem(
        `senslop:scroll:${key}`,
        String(location.scrollTop),
      );
      if (location.context)
        setContextLocation({
          ...location,
          start: undefined,
          end: undefined,
          reviewId: preview.id,
          revisionKey: `${preview.hash}:${preview.round}`,
        });
      else {
        setContextLocation(null);
        setSelection({
          id: preview.id,
          path: location.path,
          unitId: location.unitId,
        });
        setEvidence(null);
      }
      requestAnimationFrame(() =>
        readingScroll.current?.scrollTo({ top: location.scrollTop }),
      );
    },
    [preview],
  );
  const goHistory = (direction: -1 | 1) =>
    restoreLocation(trail.go(direction, readingScroll.current?.scrollTop ?? 0));
  const returnToReview = () =>
    restoreLocation(
      trail.returnToReview(readingScroll.current?.scrollTop ?? 0),
    );
  const restoredTrail = useRef<string | null>(null);
  useEffect(() => {
    const key = identity
      ? `${identity.id}:${identity.hash}:${identity.round}`
      : null;
    if (!key || !trail.ready || !trail.current || restoredTrail.current === key)
      return;
    restoredTrail.current = key;
    restoreLocation(trail.current);
  }, [identity, trail, restoreLocation]);
  const completionPending = useRef(new Set<string>());
  const latestSelection = useRef({
    id: preview?.id,
    hash: preview?.hash,
    round: preview?.round,
    path: selectedFile?.path,
    unitId: selectedUnit?.id,
  });
  useEffect(() => {
    latestSelection.current = {
      id: preview?.id,
      hash: preview?.hash,
      round: preview?.round,
      path: selectedFile?.path,
      unitId: selectedUnit?.id,
    };
  }, [
    preview?.id,
    preview?.hash,
    preview?.round,
    selectedFile?.path,
    selectedUnit?.id,
  ]);
  const completed = selectedUnit
    ? selectedUnit.reviewed
    : !!selectedFile && !!preview?.completedPaths?.includes(selectedFile.path);
  const nextFile = orderedFiles[selectedIndex + 1];
  const toggleCompletion = useCallback(() => {
    if (!selectedFile) return;
    const key = JSON.stringify([
      preview?.id,
      preview?.hash,
      preview?.round,
      selectedFile.path,
      selectedUnit?.id,
    ]);
    if (completionPending.current.has(key)) return;
    completionPending.current.add(key);
    const action = selectedUnit
      ? precision.act({
          action: "complete-unit",
          unitId: selectedUnit.id,
          reviewed: !completed,
        })
      : changeReview({
          action: "complete",
          path: selectedFile.path,
          complete: !completed,
        });
    void action
      .then(() => {
        const current = latestSelection.current;
        if (
          !completed &&
          preferences.data?.autoAdvance &&
          (selectedUnit ? orderedUnits[selectedUnitIndex + 1] : nextFile) &&
          current.id === preview?.id &&
          current.hash === preview?.hash &&
          current.round === preview?.round &&
          current.path === selectedFile.path &&
          current.unitId === selectedUnit?.id
        ) {
          const next = selectedUnit
            ? orderedUnits[selectedUnitIndex + 1]
            : nextFile;
          if (next)
            selectFile(next.path, "id" in next ? String(next.id) : undefined);
        }
      })
      .catch(() => {})
      .finally(() => {
        completionPending.current.delete(key);
      });
  }, [
    changeReview,
    selectedUnit,
    precision,
    orderedUnits,
    selectedUnitIndex,
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
    onToggleCompletion: activeContext ? undefined : toggleCompletion,
    onNavigate: navigateUnit,
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
      onOpenSettings={(section) => {
        setInitialSettingsSection(section);
        setSettingsOpen(true);
      }}
      onEvidence={(finding) => {
        if (preview?.files.some((file) => file.path === finding.path)) {
          selectFile(
            finding.path,
            organization?.units.find(
              (unit) =>
                unit.path === finding.path &&
                unit.ranges.some(
                  (range) =>
                    range.side === finding.side &&
                    range.start <= finding.end &&
                    range.end >= finding.start,
                ),
            )?.id,
          );
          setEvidence({ ...finding });
        } else openSource(finding);
      }}
    />
  );
  const filesPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectSwitcher />
      <ResizablePanelGroup orientation="vertical" className="min-h-0">
        <ResizablePanel defaultSize="50%" minSize="20%">
          <PreviewFiles
            preview={preview}
            grouping={grouping}
            preparing={preparing}
            selectedPath={selectedFile?.path}
            onSelect={selectFile}
            organization={organization}
            impact={impacts}
            selectedUnitId={selectedUnit?.id}
            onSelectUnit={selectUnit}
            onOrganizationAction={precision.act}
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
    </div>
  );

  const canvas = (
    <main aria-label="Review canvas" className="flex h-full min-w-0 flex-col">
      <header
        className={cn(
          "flex min-h-14 shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground md:px-5",
          !preparing && completed && "bg-success/10",
        )}
      >
        <TooltipWrapper content="Back in reading history">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back in reading history"
            disabled={!trail.canBack}
            onClick={() => goHistory(-1)}
          >
            <Undo2 className="size-4" />
          </Button>
        </TooltipWrapper>
        <TooltipWrapper content="Forward in reading history">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Forward in reading history"
            disabled={!trail.canForward}
            onClick={() => goHistory(1)}
          >
            <Redo2 className="size-4" />
          </Button>
        </TooltipWrapper>
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
            selectedFile && !preparing && "font-mono",
            completed && !preparing ? "text-success" : "text-foreground",
          )}
        >
          {preparing
            ? "Preparing review…"
            : (activeContext?.path ?? selectedFile?.path ?? "No file selected")}
        </span>
        <div
          className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain md:max-w-[70%]"
          aria-label="Workspace controls"
        >
          {selectedFile && (
            <>
              <TooltipWrapper
                content={organization ? "Previous region" : "Previous file"}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    organization ? "Previous region" : "Previous file"
                  }
                  disabled={
                    preparing ||
                    (organization ? selectedUnitIndex : selectedIndex) <= 0
                  }
                  onClick={() => navigateFile(-1)}
                >
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper
                content={organization ? "Next region" : "Next file"}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={organization ? "Next region" : "Next file"}
                  disabled={
                    preparing ||
                    selectedIndex < 0 ||
                    (organization
                      ? selectedUnitIndex >= orderedUnits.length - 1
                      : selectedIndex >= (preview?.files.length ?? 0) - 1)
                  }
                  onClick={() => navigateFile(1)}
                >
                  <ArrowRight aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper
                content={
                  selectedUnit
                    ? "Toggle region completion (D)"
                    : "Toggle file completion (D)"
                }
              >
                <Button
                  variant={completed ? "secondary" : "ghost"}
                  size="icon"
                  aria-label={completed ? "Mark incomplete" : "Mark complete"}
                  aria-pressed={completed}
                  aria-keyshortcuts="d"
                  disabled={preparing || !!activeContext || precision.pending}
                  onClick={toggleCompletion}
                >
                  <Check aria-hidden="true" className="size-5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Find a file (K)">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Find a file"
                  aria-keyshortcuts="k"
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
            review={
              preview?.hash && preview.round
                ? { id: preview.id, hash: preview.hash, round: preview.round }
                : null
            }
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
      {precision.state.error && !organization && (
        <p
          role="status"
          className="border-b p-4 text-base text-muted-foreground"
        >
          {precision.state.error.message}
        </p>
      )}
      {activeContext && (
        <div className="flex items-center gap-2 border-b px-4 py-2 text-base">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {preview?.files.some((file) => file.path === activeContext.path)
              ? "Captured source"
              : "Unchanged context"}
            : {activeContext.side === "before" ? "Before" : "After"}
          </span>
          <Button variant="outline" onClick={returnToReview}>
            Return to review
          </Button>
          <TooltipWrapper content="Close source context">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close source context"
              onClick={returnToReview}
            >
              <X />
            </Button>
          </TooltipWrapper>
        </div>
      )}
      {!preparing && selectedFile && (
        <ChangeImpactPanel
          side={explorerSide}
          impact={impacts.find((item) => item.unitId === selectedUnit?.id)}
          capability={
            explorer.data?.capabilities[
              activeContext?.path ?? selectedFile.path
            ]
          }
          symbols={
            explorer.data?.symbols.filter(
              (symbol) =>
                symbol.path === (activeContext?.path ?? selectedFile.path),
            ) ?? []
          }
          onNavigate={openSource}
        />
      )}
      {!preparing &&
        selectedFile?.oldPath &&
        selectedFile.oldPath !== selectedFile.path && (
          <p className="flex items-center gap-2 border-b px-4 py-2 text-base text-muted-foreground">
            <span className="font-mono break-all">{selectedFile.oldPath}</span>
            <ArrowRight className="size-4 shrink-0" />
            <span className="font-mono break-all">{selectedFile.path}</span>
          </p>
        )}
      {settings.whitespace && settings.whitespace !== "all" && (
        <p className="border-b px-4 py-2 text-base text-muted-foreground">
          {formatWhitespaceMode(settings.whitespace)} whitespace filter is
          active; completion remains manual.
        </p>
      )}
      {!!grouping?.organizationLimitations?.length && (
        <p className="border-b px-4 py-2 text-base text-muted-foreground">
          {grouping.organizationLimitations.join(" ")}
        </p>
      )}
      {!preparing && selectedUnit && !activeContext && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 text-base">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {selectedUnit.label}
          </span>
          <Button
            variant={fullFile ? "ghost" : "secondary"}
            onClick={() => setFullFile(false)}
          >
            Region
          </Button>
          {!fullFile && (
            <Button
              variant="ghost"
              onClick={() =>
                setRegionContext((value) => (value >= 20 ? 0 : value + 5))
              }
            >
              {regionContext} context lines
            </Button>
          )}
          <Button
            variant={fullFile ? "secondary" : "ghost"}
            onClick={() => setFullFile(true)}
          >
            Full file
          </Button>
          <TooltipWrapper content="Mark all regions in this file reviewed">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mark all regions in this file reviewed"
              onClick={() =>
                void precision
                  .act({
                    action: "complete-file",
                    path: selectedUnit.path,
                    reviewed: true,
                  })
                  .catch(() => {})
              }
            >
              <Check />
            </Button>
          </TooltipWrapper>
        </div>
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
        ref={readingScroll}
        data-review-scroll
        data-reading-key={
          preview && selectedFile
            ? `${preview.id}:${preview.hash}:${preview.round}:${activeContext?.path ?? selectedFile.path}:${activeContext ? "file" : (selectedUnit?.id ?? "file")}:${activeContext?.side ?? "diff"}`
            : undefined
        }
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.dataset.readingKey)
            sessionStorage.setItem(
              `senslop:scroll:${element.dataset.readingKey}`,
              String(element.scrollTop),
            );
        }}
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        {activeContext ? (
          frozenSource.data ? (
            <PreviewDiff
              key={`${preview?.id}:${activeContext.path}:${activeContext.side}`}
              file={{
                path: activeContext.path,
                oldPath: null,
                status: "M",
                before: frozenSource.data.contents,
                after: frozenSource.data.contents,
                beforeHash: null,
                afterHash: null,
                binary: false,
                added: 0,
                deleted: 0,
                diff: "",
              }}
              view={view}
              settings={settings}
              notes={[]}
              readOnly
              onAddComment={() => {}}
              onDeleteNote={() => {}}
              evidence={
                activeContext.start
                  ? {
                      side: "after",
                      start: activeContext.start,
                      end: activeContext.end ?? activeContext.start,
                    }
                  : null
              }
            />
          ) : (
            <p
              role={frozenSource.error ? "alert" : "status"}
              className="p-5 text-muted-foreground"
            >
              {frozenSource.error?.message ?? "Opening captured source…"}
            </p>
          )
        ) : preparing ? (
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
              agents.act(
                groupingJobs[0] &&
                  (groupingJobs[0].status === "failed" ||
                    groupingJobs[0].status === "canceled")
                  ? { action: "retry", id: groupingJobs[0].id }
                  : {
                      action: "job",
                      snapshotId: preview!.id,
                      kind: "grouping",
                      expectedHash: preview!.hash,
                      expectedRound: preview!.round,
                    },
              )
            }
            onConfigure={() => {
              setInitialSettingsSection("ai");
              setSettingsOpen(true);
            }}
            onStop={(id) =>
              agents.act(
                id
                  ? { action: "cancel", id }
                  : {
                      action: "cancel-grouping",
                      snapshotId: preview!.id,
                      expectedHash: preview!.hash,
                      expectedRound: preview!.round,
                    },
              )
            }
            onDiscard={discardReview}
          />
        ) : preview ? (
          selectedFile ? (
            <StructuredDiffPreview file={selectedFile}>
              <PreviewDiff
                key={`${preview.id}:${selectedFile.path}:${selectedUnit?.id ?? "file"}:${fullFile}`}
                file={selectedFile}
                regions={!fullFile ? selectedUnit?.ranges : undefined}
                contextLines={regionContext}
                view={view}
                settings={settings}
                notes={reviewNotes.filter(
                  (note) => note.path === selectedFile.path,
                )}
                onAddComment={addNote}
                onDeleteNote={deleteNote}
                snapshotId={preview.id}
                evidence={
                  evidence?.path === selectedFile.path
                    ? evidence
                    : !fullFile && selectedUnit?.ranges.length
                      ? (selectedUnit.ranges.find(
                          (range) => range.side === "after",
                        ) ?? selectedUnit.ranges[0])
                      : null
                }
              />
            </StructuredDiffPreview>
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
      <NotificationListener />
      {preview && (
        <FileSearchDialog
          review={identity}
          onSource={openSource}
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
