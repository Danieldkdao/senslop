"use client";

import { useEffect, useState } from "react";
import { GitBranch, Upload, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "@/components/ui/toast";
import { useGitWorkflow } from "../hooks/use-git-workflow";
import { formatGitCommitCount } from "../lib/formatters";
import { GitChanges } from "./git-changes";
import { GitOutgoing } from "./git-outgoing";
import { GitConflicts } from "./git-conflicts";

export const GitDialog = ({
  onOpenFile,
}: {
  onOpenFile: (path: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("senslop-git", show);
    return () => window.removeEventListener("senslop-git", show);
  }, []);
  const [selectedRemote, setRemote] = useState<string | null>(null);
  const [selectedBranch, setBranch] = useState<string | null>(null);
  const git = useGitWorkflow(open);
  const state = git.state.data;
  const remote = selectedRemote ?? state?.remotes[0]?.name ?? "";
  const branch = selectedBranch ?? state?.branch ?? "";
  const networkAction = async (action: "fetch" | "pull") => {
    if (!state) return;
    try {
      await git.act(
        action === "fetch"
          ? { action, remote, expected: state.identity }
          : { action, remote, branch, expected: state.identity },
      );
      toast.success(`${action === "fetch" ? "Fetch" : "Pull"} completed.`);
    } catch {}
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipWrapper content="Git (G)">
        <DialogTrigger
          render={<Button variant="ghost" size="icon" aria-label="Git" />}
        >
          <GitBranch className="size-5" />
        </DialogTrigger>
      </TooltipWrapper>
      <DialogContent className="flex h-[90dvh] max-h-none w-[calc(100vw-2rem)] flex-col gap-4 overflow-hidden text-base sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>Git</DialogTitle>
          <DialogDescription>
            Inspect live changes, commit staged content, and manage outgoing
            work.
          </DialogDescription>
        </DialogHeader>
        {git.state.error && <p role="alert">{git.state.error.message}</p>}
        {state && (
          <>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <GitBranch className="size-5 text-primary" />
                <span className="font-mono">{state.branch}</span>
              </div>
              {state.upstream && (
                <span className="font-mono text-muted-foreground">
                  {state.upstream}
                </span>
              )}
              <div className="flex items-center gap-4">
                <TooltipWrapper
                  content={`${formatGitCommitCount(state.ahead)} ahead of the tracked upstream, ready to push`}
                >
                  <span
                    tabIndex={0}
                    aria-label={`${formatGitCommitCount(state.ahead)} to push`}
                    className="flex items-center gap-2"
                  >
                    <Upload className="size-4 text-primary" />
                    {state.ahead}
                  </span>
                </TooltipWrapper>
                <TooltipWrapper
                  content={`${formatGitCommitCount(state.behind)} behind the tracked upstream; fetch to refresh`}
                >
                  <span
                    tabIndex={0}
                    aria-label={`${formatGitCommitCount(state.behind)} to pull`}
                    className="flex items-center gap-2"
                  >
                    <Download className="size-4 text-muted-foreground" />
                    {state.behind}
                  </span>
                </TooltipWrapper>
              </div>
              <TooltipWrapper content="Refresh Git">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh Git"
                  onClick={() => void git.state.refetch()}
                >
                  <RefreshCw />
                </Button>
              </TooltipWrapper>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={remote}
                onValueChange={(value) => setRemote(value)}
              >
                <SelectTrigger
                  className="w-full sm:flex-1"
                  aria-label="Git remote"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.remotes.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.name} {item.url}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-full font-mono sm:flex-1"
                aria-label="Destination branch"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              />
              {(
                [
                  { action: "fetch", label: "Fetch", Icon: RefreshCw },
                  {
                    action: "pull",
                    label: "Pull fast-forward",
                    Icon: Download,
                  },
                ] as const
              ).map(({ action, label, Icon }) => (
                <TooltipWrapper key={action} content={label}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={label}
                    disabled={!remote || git.pending}
                    onClick={() => void networkAction(action)}
                  >
                    <Icon />
                  </Button>
                </TooltipWrapper>
              ))}
            </div>
            {(!!state.conflicts.length || state.mergeInProgress) && (
              <GitConflicts state={state} />
            )}
            <GitChanges
              state={state}
              directory={state.directory}
              onOpenFile={(path) => {
                setOpen(false);
                onOpenFile(path);
              }}
            >
              {remote && branch && (
                <GitOutgoing state={state} remote={remote} branch={branch} />
              )}
            </GitChanges>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
