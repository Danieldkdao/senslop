"use client";

import { formatConnectionStatus, formatFirstName } from "../lib/formatters";
import {
  Check,
  Copy,
  Terminal,
  Cable,
  LoaderCircle,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { usePresence } from "@/features/connection/hooks/use-presence";
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

export const ConnectionChecklist = ({ name }: { name: string }) => {
  const { status, devices } = usePresence();
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
              : `Hi, ${formatFirstName(name)}. Follow these steps to bring your local changes into Senslop.`}
          </p>
        </div>
      </div>
      {status === "retrying" && (
        <p
          role="status"
          className="mb-4 rounded-lg border p-4 text-base text-muted-foreground"
        >
          Connection service unavailable. We’re retrying automatically; your
          account remains signed in.
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
              No review has been submitted. For now, inspect a local change to
              see what qualifies. Review uploads and guided preparation arrive
              in the next build slice.
            </p>
            <Command>
              {"node packages/cli/dist/index.js inspect --working-tree"}
            </Command>
            <p className="mt-4 text-base text-muted-foreground">
              A review needs at least five text files with ten added + deleted
              lines each. Smaller files remain included.
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
          credential outside the repository. Inspection alone does not upload
          code. In later slices, review commands will send selected code and
          model requests through Senslop’s cloud services.
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
};
