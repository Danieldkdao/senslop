"use client";

import { useState } from "react";
import { History } from "lucide-react";
import {
  savedReviewSchema,
  type FindingObservationSchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { toast } from "@/components/ui/toast";
import { ChangeInspector } from "./change-inspector";

export const FindingHistoryEvidence = ({
  observation,
}: {
  observation: FindingObservationSchema;
}) => {
  const [round, setRound] = useState<
    import("@senslop/contracts").SavedReviewSchema | null
  >(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="w-full text-base"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch(
              `/api/workflow?reviewId=${observation.review.id}&round=${observation.review.round}`,
            );
            if (!response.ok)
              throw new Error(
                "Original round unavailable; the saved excerpt is shown above.",
              );
            const captured = savedReviewSchema.parse(await response.json());
            if (captured.hash !== observation.review.hash)
              throw new Error(
                "Original source revision does not match this evidence.",
              );
            setRound(captured);
            setOpen(true);
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <LoadingSwap isLoading={busy}>
          <History aria-hidden="true" className="size-4" />
          Original evidence, round {observation.review.round}
        </LoadingSwap>
      </Button>
      {round && (
        <ChangeInspector
          open={open}
          onOpenChange={setOpen}
          title="Original finding evidence"
          description={`Round ${round.round} / ${round.hash.slice(0, 8)}`}
          files={round.files}
          initialPath={observation.evidence.path}
          evidence={observation.evidence}
        />
      )}
    </>
  );
};
