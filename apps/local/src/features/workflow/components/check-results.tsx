"use client";
import {
  StopCircle,
  Download,
  History,
  ListEnd,
  FileCheck2,
  FileWarning,
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
import { CopyButton } from "../../../components/copy-button";
import { compareChecks } from "../lib/compare-checks";
import {
  formatCheckComparison,
  formatUsageDuration,
  formatCheckStatus,
} from "../lib/formatters";
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
          className="flex min-w-0 flex-col gap-2 border-b py-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <TooltipWrapper content={status.label}>
              <span tabIndex={0} role="status" aria-label={status.label}>
                <status.Icon
                  aria-hidden="true"
                  className={cn(
                    "size-5 text-muted-foreground",
                    status.loading && "animate-spin",
                  )}
                />
              </span>
            </TooltipWrapper>
            {stale && (
              <TooltipWrapper content="Historical result; source has changed">
                <History
                  aria-label="Historical result"
                  className="size-4 text-muted-foreground"
                />
              </TooltipWrapper>
            )}
            {comparisonDisplay && (
              <TooltipWrapper content={comparisonDisplay.label}>
                <comparisonDisplay.Icon
                  aria-label={comparisonDisplay.label}
                  className="size-4 text-muted-foreground"
                />
              </TooltipWrapper>
            )}
            <CollapsibleTrigger className="min-w-0 flex-1 wrap-break-word text-left font-mono text-base">
              {check.command}
            </CollapsibleTrigger>
            {["queued", "running"].includes(check.status) && (
              <TooltipWrapper content="Cancel check">
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
                  <StopCircle aria-hidden="true" className="size-4" />
                </Button>
              </TooltipWrapper>
            )}
          </div>
          <CollapsibleContent>
            <div className="flex min-w-0 flex-col gap-3">
              <span className="font-mono text-base text-muted-foreground">
                {check.sourceSide === "base" ? "Base" : "Changed source"}, round{" "}
                {check.review.round} / {check.review.hash.slice(0, 8)}
              </span>
              <dl className="flex flex-wrap gap-3 text-muted-foreground">
                <div>
                  <dt>Exit</dt>
                  <dd>{check.exitCode ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>
                    {check.durationMs === null
                      ? "Pending"
                      : formatUsageDuration(check.durationMs)}
                  </dd>
                </div>
              </dl>
              {check.error && (
                <span role="alert" className="wrap-break-word text-destructive">
                  {check.error}
                </span>
              )}
              <Collapsible>
                <CollapsibleTrigger className="text-base">
                  Environment & inputs
                </CollapsibleTrigger>
                <CollapsibleContent>
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
                </CollapsibleContent>
              </Collapsible>
              <div className="flex justify-end gap-1">
                <CopyButton text={check.output} label="Copy check output" />
                <TooltipWrapper content="Download output">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Download output"
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
                    <Download aria-hidden="true" className="size-4" />
                  </Button>
                </TooltipWrapper>
              </div>
              {!!check.artifacts.length && (
                <div className="flex flex-col gap-2">
                  {check.artifacts.map((artifact) => (
                    <div
                      key={artifact.path}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <TooltipWrapper
                        content={artifact.error ?? "Captured output artifact"}
                      >
                        {artifact.error ? (
                          <FileWarning
                            aria-label="Artifact unavailable"
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                        ) : (
                          <FileCheck2
                            aria-label="Artifact recorded"
                            className="size-4 shrink-0 text-muted-foreground"
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
                            <Download aria-hidden="true" className="size-4" />
                          </Button>
                        </TooltipWrapper>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <CheckOutput output={check.output} />
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
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Search check output"
          placeholder="Search output…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full text-base"
        />
        <TooltipWrapper content="Follow output">
          <Button
            size="icon"
            variant={follow ? "secondary" : "ghost"}
            aria-label="Follow output"
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
          >
            <ListEnd aria-hidden="true" className="size-4" />
          </Button>
        </TooltipWrapper>
      </div>
      <pre
        ref={log}
        aria-label="Check output"
        className="max-h-96 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-muted/30 p-3 font-mono text-base"
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
