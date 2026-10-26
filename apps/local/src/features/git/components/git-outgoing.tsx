"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, ShieldAlert, Upload, ChevronDown } from "lucide-react";
import type { GitStateSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSwap } from "@/components/ui/loading-swap";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/toast";
import { useGitWorkflow, useOutgoingCoverage } from "../hooks/use-git-workflow";
import { formatCoverageIssue, formatGitCommitCount } from "../lib/formatters";

const overrideSchema = z.object({ reason: z.string().trim().min(1).max(2000) });
export type OverrideSchema = z.infer<typeof overrideSchema>;

export const GitOutgoing = ({
  state,
  remote,
  branch,
}: {
  state: GitStateSchema;
  remote: string;
  branch: string;
}) => {
  const git = useGitWorkflow();
  const coverage = useOutgoingCoverage(remote, branch, true, state.identity);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const form = useForm<OverrideSchema>({
    resolver: zodResolver(overrideSchema),
    defaultValues: { reason: "" },
  });
  const push = async (overrideReason?: string) => {
    try {
      await git.act({
        action: "push",
        remote,
        branch,
        expected: state.identity,
        expectedOutgoing: coverage.data?.identity,
        overrideReason,
      });
      toast.success("Push completed.");
    } catch {}
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-mono break-all">
        <Upload className="size-4 text-primary" />
        {remote} <span aria-hidden="true">/</span> {branch}
      </p>
      {coverage.error && <p role="alert">{coverage.error.message}</p>}
      {coverage.isPending && <p role="status">Inspecting outgoing objects…</p>}
      {coverage.data && (
        <>
          <div className="flex items-center gap-2">
            {coverage.data.ready ? <CircleCheck /> : <ShieldAlert />}
            <p>
              {coverage.data.reviewed} of {coverage.data.total} changed file
              versions covered
            </p>
          </div>
          {!coverage.data.enabled && (
            <p className="text-muted-foreground">
              The push checkpoint is disabled.
            </p>
          )}
          {coverage.data.commits.map((commit) => (
            <p key={commit.oid}>
              <span className="font-mono">{commit.oid.slice(0, 12)}</span>{" "}
              {commit.subject}
            </p>
          ))}
          {coverage.data.issues.map((issue, index) => {
            const display = formatCoverageIssue(issue.kind);
            return (
              <div key={index} className="flex items-start gap-2 border-b py-2">
                <display.Icon className="mt-1 size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p>{display.label}</p>
                  <p className="text-muted-foreground">{issue.message}</p>
                  {issue.path && (
                    <p className="flex items-center gap-2 font-mono break-all">
                      <Upload className="size-4 text-primary" />
                      {issue.path}
                    </p>
                  )}
                  {issue.reviewId && (
                    <Button
                      variant="link"
                      onClick={() =>
                        window.open(
                          `/?review=${issue.reviewId}`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      Open review
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <Button
            disabled={
              git.pending ||
              !coverage.data.commits.length ||
              (coverage.data.enabled && !coverage.data.ready)
            }
            onClick={() => void push()}
          >
            <LoadingSwap isLoading={git.pending}>
              {coverage.data.commits.length
                ? `Push ${formatGitCommitCount(coverage.data.commits.length)}`
                : "Up to date"}
            </LoadingSwap>
          </Button>
          {coverage.data.enabled && !coverage.data.ready && (
            <Collapsible open={overrideOpen} onOpenChange={setOverrideOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-base underline">
                Override and push{" "}
                <ChevronDown className="size-4 transition-transform group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <form
                  noValidate
                  className="flex flex-col gap-3 pt-3"
                  onSubmit={form.handleSubmit(({ reason }) => push(reason))}
                >
                  <label className="flex flex-col gap-1">
                    Override reason
                    <Textarea
                      className="w-full text-base"
                      {...form.register("reason")}
                    />
                  </label>
                  {form.formState.errors.reason && (
                    <p role="alert">Enter an override reason.</p>
                  )}
                  <Button type="submit" disabled={git.pending}>
                    <LoadingSwap isLoading={git.pending}>
                      Record override and push
                    </LoadingSwap>
                  </Button>
                </form>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </div>
  );
};
