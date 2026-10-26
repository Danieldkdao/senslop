"use client";
import { Download, FileCode, Trash2, FolderGit2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectSettings } from "../hooks/use-project-settings";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useConfirm } from "@/hooks/use-confirm";
import { toast } from "@/components/ui/toast";

export const DataSettings = () => {
  const settings = useProjectSettings();
  const client = useQueryClient();
  const cleanupConfirmation = useConfirm(
    "Discard this managed workspace?",
    "Removes this Senslop-owned worktree and any newer edits inside it. Active tasks must be stopped first. The original project stays intact.",
  );
  const { confirm, ConfirmationDialog } = useConfirm(
    "Delete this project's history?",
    "Deletes saved reviews, source evidence, findings, tasks, and checks. Cancel active tasks and checks first. Newer managed edits must be reviewed or explicitly cleaned up.",
  );
  const download = async (query: string, name: string) => {
    try {
      const response = await fetch(`/api/project?${query}`);
      if (!response.ok) throw new Error("Export unavailable.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <div className="flex w-full flex-col gap-4 text-base">
      {[
        {
          Icon: Download,
          label: "Export metadata and decisions",
          query: "export=metadata",
          name: "senslop-project-metadata.json",
        },
        {
          Icon: FileCode,
          label: "Export including captured source",
          query: "export=source",
          name: "senslop-project-source.json",
        },
      ].map((action) => (
        <div key={action.query} className="flex items-center gap-3">
          <span className="flex-1">{action.label}</span>
          <TooltipWrapper content={action.label}>
            <Button
              size="icon"
              variant="outline"
              aria-label={action.label}
              onClick={() => void download(action.query, action.name)}
            >
              <action.Icon aria-hidden="true" className="size-5" />
            </Button>
          </TooltipWrapper>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <span className="flex-1">Delete project history</span>
        <TooltipWrapper content="Delete project history">
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            aria-label="Delete project history"
            onClick={async () => {
              if (!(await confirm())) return;
              try {
                const response = await fetch("/api/project", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "delete-history",
                    confirm: true,
                  }),
                });
                if (!response.ok) {
                  const data = await response.json();
                  throw new Error(data.message ?? "Deletion failed.");
                }
                window.location.reload();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </Button>
        </TooltipWrapper>
      </div>
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Managed workspaces</h3>
        {settings.state.data?.workspaces
          .filter((manifest) => !manifest.removedAt)
          .map((manifest) => (
            <div
              key={manifest.id}
              className="flex min-w-0 items-start gap-2 border-b py-3"
            >
              <FolderGit2 aria-hidden="true" className="mt-1 size-4 shrink-0" />
              <span className="min-w-0 flex-1 wrap-break-word font-mono text-base">
                {manifest.directory}
              </span>
              <TooltipWrapper content="Discard managed workspace">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Discard managed workspace"
                  onClick={async () => {
                    if (!(await cleanupConfirmation.confirm())) return;
                    try {
                      const response = await fetch("/api/project", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "cleanup-workspace",
                          id: manifest.id,
                          discard: true,
                        }),
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.message);
                      await client.invalidateQueries({
                        queryKey: ["project-settings"],
                      });
                      toast.success("Managed workspace removed.");
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </TooltipWrapper>
            </div>
          ))}
      </section>
      {cleanupConfirmation.ConfirmationDialog}
      {ConfirmationDialog}
    </div>
  );
};
