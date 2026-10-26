"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { FolderGit2, Files, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWorkspaceMetadata } from "../../workspace/hooks/use-workspace-metadata";

export const FirstRunGuide = ({ hasReview }: { hasReview: boolean }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const workspace = useWorkspaceMetadata();
  const dismissed = useSyncExternalStore(
    (listener) => {
      window.addEventListener("storage", listener);
      return () => window.removeEventListener("storage", listener);
    },
    () => !!localStorage.getItem("senslop:setup-dismissed"),
    () => true,
  );
  useEffect(() => {
    const show = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("senslop-setup", show);
    return () => window.removeEventListener("senslop-setup", show);
  }, []);
  const close = () => {
    localStorage.setItem("senslop:setup-dismissed", "true");
    window.dispatchEvent(new Event("storage"));
    setOpen(false);
  };
  const Icon = step === 0 ? FolderGit2 : step === 1 ? Files : Bot;
  return (
    <Dialog
      open={open || (!hasReview && !dismissed)}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent className="text-base">
        <DialogHeader>
          <DialogTitle>Start a local review</DialogTitle>
          <DialogDescription>
            Review your changes locally with optional AI assistance.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Icon className="size-8" />
          {step === 0 ? (
            <>
              <p>Confirm your project</p>
              <p className="break-all font-mono">
                {workspace.data?.repository?.root ?? "Loading project…"}
              </p>
              <p className="font-mono">{workspace.data?.repository?.branch}</p>
            </>
          ) : step === 1 ? (
            <>
              <p>
                Choose working-tree changes, a commit, a range, or a branch
                comparison.
              </p>
              <p className="text-muted-foreground">
                The new-review control captures the exact source you select.
              </p>
            </>
          ) : (
            <>
              <p>AI grouping and correctness analysis are optional.</p>
              <p className="text-muted-foreground">
                Remote models receive permitted context; you can review files
                without configuring a model.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  close();
                  window.dispatchEvent(
                    new CustomEvent("senslop-open-settings", { detail: "ai" }),
                  );
                }}
              >
                Configure optional AI
              </Button>
            </>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Skip
            </Button>
            <Button
              onClick={() => {
                if (step < 2) setStep(step + 1);
                else {
                  close();
                  window.dispatchEvent(new Event("senslop-new-review"));
                }
              }}
            >
              {step < 2 ? "Continue" : "Choose changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
