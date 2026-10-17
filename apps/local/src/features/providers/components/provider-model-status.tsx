"use client";

import { Check, Loader2, RefreshCw, X } from "lucide-react";
import type { ProviderId, PublicConnectionSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import type { useProviderModels } from "../hooks/use-provider-models";
import { formatProvider, formatProviderModelCheck } from "../lib/formatters";
import type { ProviderConnectionStatus } from "../types";

type ProviderModelStatusProps = {
  provider?: ProviderId;
  connection?: PublicConnectionSchema;
  entry?: ReturnType<typeof useProviderModels>["entries"][number];
  status?: ProviderConnectionStatus;
  onRefresh?: () => Promise<unknown> | void;
};

export const ProviderModelStatus = ({
  provider,
  connection: savedConnection,
  entry,
  status,
  onRefresh,
}: ProviderModelStatusProps) => {
  const connection = savedConnection ?? entry?.connection;
  if (!connection && !status?.busy && !status?.error) return null;
  const providerId = connection?.provider ?? provider;
  const label = providerId ? formatProvider(providerId).label : "Provider";
  const error =
    status?.error ?? connection?.credentialError ?? entry?.error?.message;
  const checking =
    !!status?.busy ||
    !!entry?.fetching ||
    (!error && (!!entry?.pending || !entry));
  const presentation = formatProviderModelCheck({
    checking,
    error,
    catalog: entry?.catalog,
  });
  const refresh = onRefresh ?? entry?.refetch;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1"
      aria-busy={checking}
    >
      <TooltipWrapper content={presentation.message}>
        <button
          type="button"
          className="size-7 cursor-default flex items-center justify-center"
          aria-label={`${label}: ${presentation.label}`}
        >
          {presentation.state === "checking" ? (
            <Loader2
              aria-hidden="true"
              className={cn("size-4", presentation.className)}
            />
          ) : presentation.state === "failed" ? (
            <X
              aria-hidden="true"
              className={cn("size-4", presentation.className)}
            />
          ) : (
            <Check
              aria-hidden="true"
              className={cn("size-4", presentation.className)}
            />
          )}
        </button>
      </TooltipWrapper>
      <TooltipWrapper
        content={`Refresh ${label} models using the saved connection.`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          disabled={checking || !connection || !refresh}
          aria-label={`Refresh ${label} models`}
          onClick={() => void refresh?.()}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
        </Button>
      </TooltipWrapper>
    </span>
  );
};
