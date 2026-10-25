"use client";
import { useState } from "react";
import { useRoundComparison } from "../hooks/use-round-comparison";
import { ArrowRight, GitCompareArrows, History } from "lucide-react";
import { type ReviewIdentitySchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { useReviewWorkflow } from "../hooks/use-review-workflow";
import { compareRounds } from "../lib/compare-rounds";
import { ChangeInspector } from "./change-inspector";

export const RoundComparison = ({
  review,
}: {
  review: ReviewIdentitySchema;
}) => {
  const workflow = useReviewWorkflow(review);
  const rounds = workflow.state.data?.rounds ?? [];
  const [left, setLeft] = useState<number>();
  const [right, setRight] = useState<number>();
  const [mode, setMode] = useState<"compare" | "history" | null>(null);
  const source = left ?? rounds[1]?.round ?? review.round;
  const destination = right ?? review.round;
  const evidence = useRoundComparison(review.id, source, destination, mode);
  return (
    <>
      <Popover>
        <TooltipWrapper
          content={`Round ${review.round}: history and comparison`}
        >
          <PopoverTrigger
            render={
              <Button size="icon" variant="ghost" aria-label="Review rounds" />
            }
          >
            <GitCompareArrows aria-hidden="true" className="size-5" />
          </PopoverTrigger>
        </TooltipWrapper>
        <PopoverContent className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-4 text-base">
          <PopoverTitle>Review rounds</PopoverTitle>
          <div className="flex w-full min-w-0 items-center gap-2">
            {[
              { label: "From round", value: source, onChange: setLeft },
              { label: "To round", value: destination, onChange: setRight },
            ].map((field, index) => (
              <div
                key={field.label}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                {index === 1 && (
                  <ArrowRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                )}
                <Select
                  value={String(field.value)}
                  onValueChange={(value) =>
                    value && field.onChange(Number(value))
                  }
                >
                  <SelectTrigger
                    aria-label={field.label}
                    className="w-full text-base"
                  >
                    <SelectValue>Round {field.value}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {rounds.map((round) => (
                      <SelectItem
                        key={round.round}
                        value={String(round.round)}
                        className="text-base"
                      >
                        Round {round.round}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button
            onClick={() => setMode("compare")}
            disabled={source === destination}
          >
            <GitCompareArrows aria-hidden="true" className="size-4" />
            Compare rounds
          </Button>
          <Button variant="outline" onClick={() => setMode("history")}>
            <History aria-hidden="true" className="size-4" />
            Open original evidence
          </Button>
        </PopoverContent>
      </Popover>
      {!!mode && evidence.isPending && (
        <span role="status">
          <LoadingSwap isLoading>Loading rounds</LoadingSwap>
        </span>
      )}
      {evidence.error && (
        <span role="alert" className="text-destructive">
          {evidence.error.message}
        </span>
      )}
      {mode && evidence.data && (
        <ChangeInspector
          open
          onOpenChange={(open) => !open && setMode(null)}
          title={
            mode === "compare"
              ? `Round ${source} to Round ${destination}`
              : `Round ${source}`
          }
          description="Read-only captured source. Current reading progress is preserved."
          files={
            mode === "compare"
              ? compareRounds(evidence.data[0], evidence.data[1])
              : evidence.data[0].files
          }
        />
      )}
    </>
  );
};
