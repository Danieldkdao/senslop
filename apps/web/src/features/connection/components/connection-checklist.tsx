"use client";

import { formatConnectionStatus } from "../lib/formatters";
import {
  Check,
  Copy,
  Terminal,
  Cable,
  LoaderCircle,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { useLivePreview } from "@/features/review/components/live-preview-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const Command = ({ children }: { children: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <code className="min-w-0 flex-1 overflow-auto whitespace-pre text-base">
        {children}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy command"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(children);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
};

export const ConnectionChecklist = () => {
  const {
    connection: { status, devices, error },
  } = useLivePreview();
  const connected = status === "live" && devices.length > 0;
  return (
    <section
      className="mx-auto w-full max-w-2xl px-5 py-8 md:px-8 md:py-12"
      aria-label="CLI setup"
    >
      <div className="mb-7 space-y-4">
        <Badge
          variant="secondary"
          className="gap-2 py-1.5 text-base"
          role="status"
        >
          {status === "live" ? (
            <Cable aria-hidden="true" className="size-4" />
          ) : status === "retrying" ? (
            <WifiOff aria-hidden="true" className="size-4" />
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          )}
          {formatConnectionStatus({ status, devices })}
        </Badge>
        <div>
          <h1 className="font-sans text-2xl font-semibold md:text-3xl">
            {connected ? "Ready for your first review" : "Connect your CLI"}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            {connected
              ? "Your local CLI is connected. Your next review will live right here."
              : "Follow these steps to bring your local changes into Senslop."}
          </p>
        </div>
      </div>
      {status === "retrying" && (
        <p
          role="status"
          className="mb-4 rounded-lg border p-4 text-base text-muted-foreground"
        >
          {error ?? "Connection service unavailable."} We’re retrying
          automatically.
        </p>
      )}
      {connected ? (
        <Card className="shadow-none">
          <CardContent>
            <p className="mb-4 flex items-center gap-2 font-medium">
              <Check className="size-5 text-primary" />
              Connected through {devices.map((d) => d.name).join(", ")}
            </p>
            <p className="mb-5 text-base text-muted-foreground">
              No preview has been sent yet. Keep this page and your connection
              terminal open, then inspect selected changes from another
              terminal.
            </p>
            <Command>
              {"node packages/cli/dist/index.js inspect --working-tree"}
            </Command>
            <p className="mt-4 text-base text-muted-foreground">
              Inspect any changed files, or run inspect without source options
              to select a commit, range, or branch. This preview is kept in
              memory and disappears when you reload.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[
            {
              n: "01",
              title: "Build the local CLI",
              description:
                "While we build Senslop, use the local executable. The installable npm archive is a later checkpoint.",
              command: "pnpm --filter @senslop/cli build",
            },
            {
              n: "02",
              title: "Approve this computer",
              description:
                "Run from the Senslop repository root. Open the displayed link and compare its code before you approve.",
              command:
                "node packages/cli/dist/index.js login --url http://localhost:3000",
            },
            {
              n: "03",
              title: "Keep a connection open",
              description:
                "Leave this terminal running. Use a second terminal to inspect local changes.",
              command: "node packages/cli/dist/index.js connect",
            },
          ].map((step) => (
            <Card key={step.n} size="sm" className="shadow-none">
              <CardContent className="flex-row gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-medium text-primary">
                  {step.n}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-sans text-xl font-medium">
                    {step.title}
                  </h2>
                  <p className="mb-4 mt-2 text-base text-muted-foreground">
                    {step.description}
                  </p>
                  <Command>{step.command}</Command>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Collapsible className="mt-6">
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="text-base text-muted-foreground"
            />
          }
        >
          <Terminal />
          What stays on my computer?
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pt-3 text-base text-muted-foreground">
          The CLI reads your Git repository locally and stores its revocable
          credential outside the repository. Inspect sends selected before/after
          code and patches through Senslop’s connection service to your open
          dashboard signed in to the same account. Inspect with --json stays
          local. Streamed code is not saved in the database.
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
};
