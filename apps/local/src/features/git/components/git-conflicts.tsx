"use client";

import { useState } from "react";
import type { GitStateSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useConfirm } from "@/hooks/use-confirm";
import { useGitConflict, useGitWorkflow } from "../hooks/use-git-workflow";

const ConflictSides = ({
  path,
  identity,
}: {
  path: string;
  identity: string;
}) => {
  const conflict = useGitConflict(path, identity);
  return (
    <div className="flex flex-col gap-3 overflow-auto pt-3">
      {conflict.error && <p role="alert">{conflict.error.message}</p>}
      {conflict.data && (
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            { label: "Base", text: conflict.data.base },
            { label: "Local", text: conflict.data.local },
            { label: "Incoming", text: conflict.data.incoming },
          ].map((side) => (
            <section
              key={side.label}
              className="flex min-w-0 flex-col gap-2 rounded-lg border p-3"
            >
              <p>{side.label}</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-base">
                {side.text ?? "File absent on this side."}
              </pre>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export const GitConflicts = ({ state }: { state: GitStateSchema }) => {
  const git = useGitWorkflow();
  const [selected, setSelected] = useState<string | null>(null);
  const { confirm, ConfirmationDialog } = useConfirm(
    "Abort this merge?",
    "Git will discard this merge’s conflict resolutions and attempt to restore its pre-merge state.",
  );
  return (
    <section className="flex max-h-[40dvh] shrink-0 scroll-fade-y flex-col gap-3 overflow-auto rounded-lg border p-3">
      <p role="alert">
        Resolve conflicts in your editor, then stage the resolved files or abort
        the merge.
      </p>
      {state.conflicts.map((path) => (
        <Collapsible
          key={path}
          open={selected === path}
          onOpenChange={(open) => setSelected(open ? path : null)}
        >
          <CollapsibleTrigger className="break-all text-left font-mono text-base">
            {path}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ConflictSides path={path} identity={state.identity} />
          </CollapsibleContent>
        </Collapsible>
      ))}
      {state.mergeInProgress && (
        <Button
          variant="outline"
          disabled={git.pending}
          onClick={async () => {
            if (await confirm()) {
              try {
                await git.act({
                  action: "abort-merge",
                  expected: state.identity,
                });
              } catch {}
            }
          }}
        >
          <LoadingSwap isLoading={git.pending}>Abort merge</LoadingSwap>
        </Button>
      )}
      {ConfirmationDialog}
    </section>
  );
};
