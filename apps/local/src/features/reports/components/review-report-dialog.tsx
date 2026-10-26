"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";
import { FileText, Download, Copy, RefreshCw, CodeXml } from "lucide-react";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/toast";
import {
  useReviewReports,
  useReportEvidence,
} from "../hooks/use-review-reports";

const FrozenEvidence = ({
  reportId,
  path,
  round,
  location,
}: {
  reportId: string;
  path: string;
  round?: number;
  location?: { side: string; start: number; end: number };
}) => {
  const evidence = useReportEvidence(reportId, path, round);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <p className="font-medium">
        Captured evidence{round ? ` / round ${round}` : ""}
        {location
          ? ` / ${location.side} lines ${location.start}–${location.end}`
          : ""}
      </p>
      {evidence.isPending && <p role="status">Loading captured source…</p>}
      {evidence.error && <p role="alert">{evidence.error.message}</p>}
      {evidence.data && (
        <>
          {location ? (
            <pre className="overflow-auto whitespace-pre-wrap font-mono text-base">
              {(location.side === "before"
                ? evidence.data.before
                : evidence.data.after
              )
                ?.split("\n")
                .slice(Math.max(0, location.start - 1), location.end)
                .join("\n") ?? "Source unavailable on this side."}
            </pre>
          ) : (
            <pre className="overflow-auto whitespace-pre-wrap font-mono text-base">
              {evidence.data.diff ||
                evidence.data.after ||
                evidence.data.before ||
                "Binary or unavailable source."}
            </pre>
          )}
        </>
      )}
    </div>
  );
};

export const ReviewReportDialog = ({
  review,
}: {
  review: ReviewIdentitySchema;
}) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("senslop-report", show);
    return () => window.removeEventListener("senslop-report", show);
  }, []);
  const [selection, setSelection] = useState({
    reviewId: review.id,
    currentRound: review.round,
    round: review.round,
    reportId: null as string | null,
  });
  const matches =
    selection.reviewId === review.id && selection.currentRound === review.round;
  if (!matches)
    setSelection({
      reviewId: review.id,
      currentRound: review.round,
      round: review.round,
      reportId: null,
    });
  const round = matches ? selection.round : review.round;
  const reportId = matches ? selection.reportId : null;
  const setRound = (round: number) =>
    setSelection((current) => ({ ...current, round, reportId: null }));
  const setReportId = (reportId: string | null) =>
    setSelection((current) =>
      current.reviewId === review.id && current.currentRound === review.round
        ? { ...current, reportId }
        : current,
    );
  const [includeSource, setIncludeSource] = useState(false);
  const reports = useReviewReports(review.id, open, reportId);
  const report =
    reports.report.data?.review.id === review.id &&
    reports.report.data.review.round === round
      ? reports.report.data
      : null;
  const download = async (format: "html" | "json") => {
    if (!report) return;
    try {
      const response = await fetch(
        `/api/reports?id=${report.id}&source=${includeSource}&format=${format}`,
      );
      if (!response.ok) throw new Error("Report export failed.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `senslop-report-round-${report.review.round}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipWrapper content="Review report (P)">
        <DialogTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Review report" />
          }
        >
          <FileText className="size-5" />
        </DialogTrigger>
      </TooltipWrapper>
      <DialogContent className="flex h-[85dvh] w-[calc(100vw-2rem)] flex-col gap-4 overflow-hidden text-base sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review report</DialogTitle>
          <DialogDescription>
            Generate a durable report of one captured round and its recorded
            evidence.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(round)}
            onValueChange={(value) => {
              if (value) {
                setRound(Number(value));
                setReportId(null);
              }
            }}
          >
            <SelectTrigger className="w-full flex-1" aria-label="Report round">
              <SelectValue>{`Round ${round}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(reports.history.data?.rounds ?? [review.round]).map(
                (number) => (
                  <SelectItem key={number} value={String(number)}>
                    Round {number}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <TooltipWrapper content="Generate a new report version">
            <Button
              size="icon"
              variant="outline"
              aria-label="Generate report"
              disabled={reports.generate.isPending}
              onClick={async () => {
                try {
                  const generated = await reports.generate.mutateAsync({
                    round,
                    includeSource,
                  });
                  setReportId(generated.id);
                } catch {}
              }}
            >
              <LoadingSwap isLoading={reports.generate.isPending}>
                <RefreshCw />
              </LoadingSwap>
            </Button>
          </TooltipWrapper>
          {report && (
            <>
              <TooltipWrapper content="Download HTML">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Download report HTML"
                  onClick={() => void download("html")}
                >
                  <Download />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Download JSON">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Download report JSON"
                  onClick={() => void download("json")}
                >
                  <FileText />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Copy remaining-work handoff">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy remaining-work handoff"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(report.remainingWork)
                      .then(() => toast.success("Handoff copied."))
                      .catch(() => toast.error("Could not copy the handoff."));
                  }}
                >
                  <Copy />
                </Button>
              </TooltipWrapper>
            </>
          )}
        </div>
        <label className="flex items-center gap-3">
          <span className="flex-1">
            Include permitted frozen source excerpts
          </span>
          <Switch checked={includeSource} onCheckedChange={setIncludeSource} />
        </label>
        <Select
          value={reportId ?? ""}
          onValueChange={(value) => setReportId(value)}
        >
          <SelectTrigger className="w-full" aria-label="Saved report version">
            <SelectValue placeholder="Choose a saved report or generate one">
              {report ? format(new Date(report.createdAt), "PP p") : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {reports.history.data?.reports
              .filter((item) => item.review.round === round)
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {format(new Date(item.createdAt), "PP p")}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {reports.history.error && (
          <p role="alert">{reports.history.error.message}</p>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto">
          {report ? (
            <>
              <p>
                {report.reviewed} / {report.total} regions reviewed
              </p>
              <p className="break-all font-mono">{report.review.hash}</p>
              {report.sections.map((section) => (
                <Collapsible key={section.title} defaultOpen>
                  <CollapsibleTrigger className="text-base font-medium">
                    {section.title} ({section.items.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-col gap-3 pt-3">
                    {section.items.map((item) => (
                      <article
                        key={item.id}
                        className="flex flex-col gap-1 border-b pb-3"
                      >
                        <p>{item.label}</p>
                        {item.path && (
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-2 break-all font-mono text-base text-muted-foreground">
                              <CodeXml className="size-4 shrink-0" />
                              {item.path}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-3">
                              <FrozenEvidence
                                reportId={report.id}
                                path={item.path}
                                round={item.evidenceReview?.round}
                                location={item.location}
                              />
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                        <p className="whitespace-pre-wrap text-muted-foreground">
                          {item.detail}
                        </p>
                        {includeSource && item.code && (
                          <pre className="overflow-auto whitespace-pre-wrap font-mono text-base">
                            {item.code}
                          </pre>
                        )}
                      </article>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </>
          ) : (
            <p className="text-muted-foreground">
              Choose a round and generate its report; previous report versions
              remain available.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
