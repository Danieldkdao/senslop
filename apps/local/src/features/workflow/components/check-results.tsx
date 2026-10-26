"use client";
import {
  StopCircle,
  Download,
  History,
  ListEnd,
  Logs,
  FileCheck2,
  FileWarning,
  Clock3,
  Terminal,
  CircleAlert,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CheckRunSchema, ReviewIdentitySchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { WorkflowChevron, WorkflowDisclosure } from "./workflow-disclosure";
import { CopyButton } from "../../../components/copy-button";
import { compareChecks } from "../lib/compare-checks";
import {
  formatCheckComparison,
  formatUsageDuration,
  formatCheckStatus,
} from "../lib/formatters";
import { WorkflowHistoryAction } from "./workflow-history-action";
import type { WorkflowActionSchema } from "../schemas";

export const CheckResults = ({
  checks,
  onAction,
  currentRound,
}: {
  checks: CheckRunSchema[];
  currentRound?: ReviewIdentitySchema;
  onAction: (operation: WorkflowActionSchema) => Promise<unknown>;
}) => (
  <div className="flex flex-col">
    {checks.map((check) => {
      const status = formatCheckStatus(check.status);
      const comparison = compareChecks(check, checks);
      const comparisonDisplay = comparison
        ? formatCheckComparison(comparison)
        : null;
      const stale =
        currentRound &&
        (check.review.hash !== currentRound.hash ||
          check.review.round !== currentRound.round);
      return (
        <Collapsible
          key={check.id}
          className="flex min-w-0 flex-col gap-2 border-b p-4"
        >
          <div className="flex min-w-0 items-start gap-2 text-base leading-6">
            <TooltipWrapper content={status.label}>
              <span
                tabIndex={0}
                role="status"
                aria-label={status.label}
                className="flex h-lh items-center"
              >
                <status.Icon
                  aria-hidden="true"
                  className={cn(
                    "size-5 shrink-0",
                    status.className,
                    status.loading && "animate-spin",
                  )}
                />
              </span>
            </TooltipWrapper>
            {stale && (
              <TooltipWrapper
                content="Historical result; source has changed"
                className="h-lh items-center"
              >
                <History
                  aria-label="Historical result"
                  className="size-5 shrink-0 text-muted-foreground"
                />
              </TooltipWrapper>
            )}
            {comparisonDisplay && (
              <TooltipWrapper
                content={comparisonDisplay.label}
                className="h-lh items-center"
              >
                <comparisonDisplay.Icon
                  aria-label={comparisonDisplay.label}
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground",
                    comparisonDisplay.loading && "animate-spin",
                  )}
                />
              </TooltipWrapper>
            )}
            <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-2 text-left leading-6 font-mono text-base">
              <span className="min-w-0 flex-1 wrap-break-word">
                {check.command}
              </span>
              <WorkflowChevron />
            </CollapsibleTrigger>
            {["queued", "running"].includes(check.status) && (
              <TooltipWrapper
                content="Cancel check"
                className="h-lh items-center"
              >
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Cancel check"
                  onClick={() =>
                    void onAction({
                      action: "cancel-check",
                      checkId: check.id,
                    }).catch(() => {})
                  }
                >
                  <StopCircle aria-hidden="true" className="size-5 shrink-0" />
                </Button>
              </TooltipWrapper>
            )}
            <WorkflowHistoryAction
              kind="checks"
              id={check.id}
              disabled={["queued", "running"].includes(check.status)}
              onAction={onAction}
            />
          </div>
          <CollapsibleContent>
            <div className="flex min-w-0 flex-col gap-3">
              <span className="font-mono text-base text-muted-foreground">
                {check.sourceSide === "base" ? "Base" : "Changed source"}, round{" "}
                {check.review.round} / {check.review.hash.slice(0, 8)}
              </span>
              <div className="flex flex-wrap items-center gap-4 text-base text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Terminal className="size-5 shrink-0" />
                  {check.exitCode === null
                    ? "No exit code"
                    : `Exit ${check.exitCode}`}
                </span>
                <span className="flex items-center gap-2">
                  <Clock3 className="size-5 shrink-0" />
                  {check.durationMs === null
                    ? "Pending"
                    : formatUsageDuration(check.durationMs)}
                </span>
                <div className="flex items-center gap-1 [&_button]:size-9 [&_svg]:size-5">
                  <CopyButton text={check.output} label="Copy check output" />
                  <TooltipWrapper content="Download output">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Download output"
                      disabled={!check.output}
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([check.output], { type: "text/plain" }),
                        );
                        const anchor = document.createElement("a");
                        anchor.href = url;
                        anchor.download = `check-${check.id}.txt`;
                        anchor.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download
                        aria-hidden="true"
                        className="size-5 shrink-0"
                      />
                    </Button>
                  </TooltipWrapper>
                </div>
              </div>
              {check.error && (
                <WorkflowDisclosure
                  title="Error details"
                  Icon={CircleAlert}
                  destructive
                >
                  <p role="alert" className="wrap-break-word">
                    {check.error}
                  </p>
                </WorkflowDisclosure>
              )}
              <WorkflowDisclosure title="Environment & inputs" Icon={Settings2}>
                <pre className="overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-base">
                  {JSON.stringify(
                    {
                      command: check.command,
                      cwd: check.cwd,
                      manifestId: check.manifestId,
                      dependencyHash: check.dependencyHash,
                      ...check.environment,
                    },
                    null,
                    2,
                  )}
                </pre>
              </WorkflowDisclosure>
              <WorkflowDisclosure title="Output" Icon={Logs} defaultOpen>
                <div className="flex min-w-0 flex-col gap-3">
                  {!!check.artifacts.length && (
                    <div className="flex flex-col gap-2">
                      {check.artifacts.map((artifact) => (
                        <div
                          key={artifact.path}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <TooltipWrapper
                            content={
                              artifact.error ?? "Captured output artifact"
                            }
                          >
                            {artifact.error ? (
                              <FileWarning
                                aria-label="Artifact unavailable"
                                className="size-5 shrink-0 text-muted-foreground"
                              />
                            ) : (
                              <FileCheck2
                                aria-label="Artifact recorded"
                                className="size-5 shrink-0 text-muted-foreground"
                              />
                            )}
                          </TooltipWrapper>
                          <span className="min-w-0 flex-1 wrap-break-word font-mono text-base">
                            {artifact.path}
                          </span>
                          {!artifact.error && (
                            <TooltipWrapper content="Download artifact">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Download artifact"
                                render={
                                  <a
                                    href={`/api/workflow?checkId=${check.id}&artifact=${encodeURIComponent(artifact.path)}`}
                                    download
                                  />
                                }
                              >
                                <Download
                                  aria-hidden="true"
                                  className="size-5 shrink-0"
                                />
                              </Button>
                            </TooltipWrapper>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <CheckOutput output={check.output} />
                </div>
              </WorkflowDisclosure>
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    })}
  </div>
);

const CheckOutput = ({ output }: { output: string }) => {
  const [search, setSearch] = useState("");
  const [follow, setFollow] = useState(true);
  const log = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (follow && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [output, follow]);
  return (
    <div className="-mx-4 flex min-w-0 flex-col">
      {output && (
        <div className="flex items-center gap-2 border-y pr-2">
          <Input
            variant="search"
            aria-label="Search check output"
            placeholder="Search output…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 border-0 px-4"
          />
          <TooltipWrapper content="Follow output">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Follow output"
              aria-pressed={follow}
              onClick={() => setFollow(!follow)}
            >
              <ListEnd aria-hidden="true" className="size-5 shrink-0" />
            </Button>
          </TooltipWrapper>
        </div>
      )}
      <pre
        ref={log}
        aria-label="Check output"
        className="max-h-96 overflow-auto whitespace-pre-wrap wrap-break-word px-4 py-2 font-mono text-base"
      >
        {(search
          ? output
              .split("\n")
              .filter((line) =>
                line.toLowerCase().includes(search.toLowerCase()),
              )
              .join("\n")
          : output) || (search ? "No matching output." : "No output captured.")}
      </pre>
    </div>
  );
};
