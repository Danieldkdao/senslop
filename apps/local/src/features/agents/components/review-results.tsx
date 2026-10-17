"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  findingSeverities,
  type JobSchema,
  type FindingSchema,
} from "../schemas";
import { formatSeverity } from "../lib/formatters";
import { fixAllPrompt, findingFixPrompt } from "../lib/validate-results";
import type { LivePreview } from "../../review/types";
import { consolidateReviewLimitations } from "../lib/review-limitations";
import { matchesJobSnapshot } from "../lib/job-snapshots";
import { AgentMarkdown } from "./agent-markdown";
import { FixPrompt } from "./fix-prompt";
import { FindingEvidence } from "./finding-evidence";

export const ReviewResults = ({
  job,
  snapshot,
  onEvidence,
}: {
  job: JobSchema;
  snapshot?: LivePreview | null;
  onEvidence?: (finding: FindingSchema) => void;
}) => {
  if (!job.result || !("findings" in job.result)) return null;
  const result = job.result;
  const limitations = consolidateReviewLimitations(result.limitations);
  const files =
    snapshot?.id === job.snapshotId && matchesJobSnapshot(job, snapshot)
      ? snapshot.files
      : [];
  return (
    <div className="flex flex-col gap-6 p-4">
      {!!result.findings.length && (
        <FixPrompt prompt={fixAllPrompt(job.snapshotId, result)} />
      )}
      {!result.findings.length && (
        <p>
          No verified issues found within the analyzed changes. Check the
          analysis limitations below.
        </p>
      )}
      {findingSeverities.map((severity) => {
        const findings = result.findings.filter(
          (finding) => finding.severity === severity,
        );
        if (!findings.length) return null;
        const display = formatSeverity(severity);
        return (
          <section key={severity} className="flex flex-col gap-3">
            <h3 className={cn("font-medium", display.className)}>
              {display.label}
            </h3>
            {findings.map((finding, index) => (
              <Collapsible
                key={index}
                render={<article />}
                className={cn(
                  "min-w-0 overflow-hidden rounded-lg border",
                  display.cardClassName,
                )}
              >
                <h4>
                  <CollapsibleTrigger
                    className={cn(
                      "group/finding flex w-full items-start gap-3 p-4 text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      display.className,
                    )}
                  >
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      {finding.title}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 transition-transform group-data-[panel-open]/finding:rotate-180 motion-reduce:transition-none"
                    />
                  </CollapsibleTrigger>
                </h4>
                <CollapsibleContent>
                  <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 text-foreground">
                    <AgentMarkdown>{finding.problem}</AgentMarkdown>
                    <FindingEvidence
                      finding={finding}
                      file={files.find((file) => file.path === finding.path)}
                      onEvidence={onEvidence}
                    />
                    <FixPrompt prompt={findingFixPrompt(finding)} secondary />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </section>
        );
      })}
      {!!limitations.length && (
        <Collapsible
          render={<section />}
          className="flex min-w-0 flex-col gap-3"
        >
          <h3>
            <CollapsibleTrigger className="group/limitations flex w-full items-center gap-2 rounded-md py-2 text-left text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex-1">
                Analysis limitations ({limitations.length})
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-data-panel-open/limitations:rotate-180 motion-reduce:transition-none"
              />
            </CollapsibleTrigger>
          </h3>
          <CollapsibleContent>
            <ul className="list-disc flex flex-col gap-2 pl-5 text-muted-foreground">
              {limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
