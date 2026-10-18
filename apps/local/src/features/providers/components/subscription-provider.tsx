"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronRight, LogOut } from "lucide-react";
import type {
  PublicConnectionSchema,
  SubscriptionProvider as SubscriptionProviderId,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { toast } from "@/components/ui/toast";
import type { ProviderConnectionStatus } from "../types";
import { formatProvider } from "../lib/formatters";
import { useSubscriptionConnection } from "../hooks/use-subscription-connection";

type SubscriptionProviderProps = {
  provider: SubscriptionProviderId;
  connection?: PublicConnectionSchema;
  onSaved: () => Promise<void>;
  onStatusChange?: (status: ProviderConnectionStatus) => void;
};

export const SubscriptionProvider = ({
  provider,
  connection,
  onSaved,
  onStatusChange,
}: SubscriptionProviderProps) => {
  const info = formatProvider(provider);
  const auth = useSubscriptionConnection(provider, onSaved);
  const reportStatus = useRef(onStatusChange);
  useEffect(() => {
    reportStatus.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    reportStatus.current?.({ busy: auth.busy, error: auth.error });
    if (auth.error) toast.error(auth.error);
  }, [auth.busy, auth.error]);
  const signedIn = connection?.account;
  return (
    <div className="flex min-w-0 flex-col gap-3 text-base">
      {signedIn ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-1">
          <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
          <p className="flex min-w-0 flex-1 flex-wrap gap-x-1 text-muted-foreground">
            <span className="shrink-0">Signed in as</span>
            <span className="min-w-0 truncate text-foreground">
              {connection.account!.email}
            </span>
          </p>
          <Button
            variant="ghost"
            className="ml-auto shrink-0 text-base text-muted-foreground"
            disabled={auth.busy}
            aria-label={`Sign Out ${info.label}`}
            onClick={() => void auth.signOut(connection.id)}
          >
            <LoadingSwap
              isLoading={auth.busy}
              className="flex items-center gap-2"
            >
              <LogOut aria-hidden="true" className="size-4" />
              Sign Out
            </LoadingSwap>
          </Button>
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="font-medium">Connect account</p>
            <p className="text-muted-foreground">{info.description}</p>
          </div>
          <Button
            variant="outline"
            className="justify-self-end text-base"
            disabled={auth.busy}
            aria-label={`Sign In ${info.label}`}
            onClick={() => void auth.signIn()}
          >
            <LoadingSwap
              isLoading={auth.busy}
              className="flex items-center gap-2"
            >
              Sign In
              <ChevronRight aria-hidden="true" />
            </LoadingSwap>
          </Button>
        </div>
      )}
      {auth.pending && (
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <p role="status">Complete sign-in in your browser…</p>
          {auth.url && (
            <a
              className="underline underline-offset-4"
              href={auth.url}
              target="_blank"
              rel="noreferrer"
            >
              Open sign-in page
            </a>
          )}
          <Button variant="ghost" onClick={() => void auth.cancel()}>
            Cancel sign-in
          </Button>
        </div>
      )}
    </div>
  );
};
