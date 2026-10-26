"use client";

import { useState } from "react";
import { Info, Download, RefreshCw, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useAppInfo } from "../hooks/use-app-info";
import { formatUpdateStatus } from "../lib/formatters";

export const AboutSettings = () => {
  const info = useAppInfo();
  const [busy, setBusy] = useState(false);
  const { confirm, ConfirmationDialog } = useConfirm(
    "Update Senslop?",
    "The local workspace will stop, back up its data, and install the new release; restart Senslop when the owning terminal finishes.",
  );
  const refresh = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/about?refresh=1");
      if (!response.ok) throw new Error("Update check unavailable.");
      await info.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const update = async () => {
    if (!(await confirm())) return;
    setBusy(true);
    try {
      const response = await fetch("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      toast.info(data.message);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    try {
      const response = await fetch("/api/project?diagnostics=1");
      if (!response.ok) throw new Error("Diagnostics unavailable.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "senslop-diagnostics.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  if (!info.data)
    return (
      <p role="status">{info.error?.message ?? "Loading app information…"}</p>
    );
  const data = info.data;
  const status = formatUpdateStatus(data.update.status);
  return (
    <div className="flex flex-col gap-5 text-base">
      <div className="flex items-center gap-3">
        <Info className="size-6" />
        <div className="flex flex-1 flex-col gap-1">
          <p className="font-medium">{data.name}</p>
          <p className="text-muted-foreground">{data.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex-1">Version</span>
        <span className="font-mono">{data.update.current}</span>
      </div>
      <div className="flex items-center gap-3">
        <status.Icon className="size-5" />
        <span className="flex-1">
          {status.label}
          {data.update.available ? ` / ${data.update.latest}` : ""}
        </span>
        <TooltipWrapper content="Check for updates">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Check for updates"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <LoadingSwap isLoading={busy}>
              <RefreshCw />
            </LoadingSwap>
          </Button>
        </TooltipWrapper>
      </div>
      {data.update.available && (
        <Button disabled={busy} onClick={() => void update()}>
          <LoadingSwap isLoading={busy}>
            Update to {data.update.latest}
          </LoadingSwap>
        </Button>
      )}
      <p className="text-muted-foreground">
        Update availability appears automatically in the app and CLI.
      </p>
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-2 font-medium">
          <Stethoscope className="size-5" />
          Diagnostics
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 pt-4">
          {[
            { label: "Runtime", value: data.node },
            {
              label: "Platform",
              value: `${data.platform} / ${data.architecture}`,
            },
            { label: "Git", value: data.gitVersion },
            { label: "Data format", value: String(data.databaseVersion) },
            { label: "Pending analysis", value: String(data.pendingJobs) },
            { label: "Installation", value: data.update.installation },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="flex-1">{row.label}</span>
              <span className="font-mono">{row.value}</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="flex-1">
              Diagnostic bundle without source or credentials
            </span>
            <TooltipWrapper content="Download diagnostics">
              <Button
                size="icon"
                variant="outline"
                aria-label="Download diagnostics"
                onClick={() => void download()}
              >
                <Download />
              </Button>
            </TooltipWrapper>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {ConfirmationDialog}
    </div>
  );
};
