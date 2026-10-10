"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Star, Trash2 } from "lucide-react";
import {
  providerIds,
  type ProviderId,
  type PublicConnectionSchema,
} from "@senslop/contracts";
import { ProviderIcon } from "../../../components/provider-icon";
import { formatEndpointLocation, formatProvider } from "../lib/formatters";
import { providerRequest, readProviderSettings } from "../lib/requests";
import type { ConnectionFeedback, ProviderSettingsState } from "../types";
import { ProviderKeyForm } from "./provider-key-form";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProviderModels } from "../hooks/use-provider-models";
import { ProviderModelStatus } from "./provider-model-status";

type ProviderSettingsProps = {
  search?: string;
  onConfigure: (
    provider: ProviderId,
    connection: PublicConnectionSchema | undefined,
    onSaved: () => Promise<void>,
    feedback: {
      initialFeedback: ConnectionFeedback | null;
      onFeedback: (id: string, feedback: ConnectionFeedback | null) => void;
    },
  ) => void;
};

export const ProviderSettings = ({
  search = "",
  onConfigure,
}: ProviderSettingsProps) => {
  const { entries, refresh } = useProviderModels();
  const [state, setState] = useState<ProviderSettingsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // A new saved ID remounts its form; keep check results across that refresh.
  const [feedbackByConnection, setFeedbackByConnection] = useState<
    Record<string, ConnectionFeedback | null>
  >({});
  const rememberFeedback = (id: string, feedback: ConnectionFeedback | null) =>
    setFeedbackByConnection((current) => ({ ...current, [id]: feedback }));
  const load = useCallback(async () => {
    const data = await readProviderSettings();
    if (!data) {
      setError("Local provider settings are unavailable. Retry.");
      return;
    }
    setState(data);
    setError(null);
    await refresh();
  }, [refresh]);
  useEffect(() => {
    let active = true;
    void readProviderSettings().then((data) => {
      if (!active) return;
      if (data) setState(data);
      else setError("Local provider settings are unavailable. Retry.");
    });
    return () => {
      active = false;
    };
  }, []);
  const act = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const result = await providerRequest<{ warning?: string | null } | null>(
        body,
      );
      if (result?.warning) toast.error(result.warning);
      await load();
      return true;
    } catch (failure) {
      setError((failure as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-8 text-base">
      <p className="text-muted-foreground">
        Choose models in the AI test page. API keys are saved in your OS
        credential store; configuration stays on this computer.
      </p>
      {!state && !error && <p role="status">Loading local connections…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() =>
              void load().catch((failure: Error) => setError(failure.message))
            }
          >
            Retry settings
          </Button>
        </div>
      )}
      {state?.cleanupPending && (
        <div role="alert">
          <p>Unlock the OS credential store to remove old keys.</p>
          <Button
            disabled={busy}
            onClick={() => void act({ action: "cleanup" })}
          >
            Retry credential cleanup
          </Button>
        </div>
      )}
      {state &&
        providerIds.map((provider) => {
          const info = formatProvider(provider);
          const connections = state.connections.filter(
            (connection) => connection.provider === provider,
          );
          const options: (PublicConnectionSchema | undefined)[] =
            connections.length ? connections : [undefined];
          return (
            <section
              key={provider}
              hidden={
                !!search &&
                !`providers api key model endpoint ${info.label}`
                  .toLowerCase()
                  .includes(search)
              }
              id={`settings-provider-${provider}`}
              className="space-y-4 border-b pb-6"
              aria-label={`${info.label} connections`}
            >
              <h3 className="flex items-center gap-3 text-base font-medium text-muted-foreground">
                <ProviderIcon aria-hidden="true" name={info.icon} size={22} />
                {info.label}
              </h3>
              {options.map((connection) => (
                <div key={connection?.id ?? provider} className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-2 items-start">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">
                          {info.keyRequired ? "API key" : "Configure provider"}
                        </p>
                        <p className="text-muted-foreground">
                          {info.description}
                        </p>
                      </div>
                      {connection && (
                        <>
                          {!info.keyRequired && (
                            <p className="text-muted-foreground break-all">
                              {connection.baseURL}
                              <br />
                              {formatEndpointLocation(connection.baseURL)}
                            </p>
                          )}
                          {connection.credentialError && (
                            <p role="alert" className="text-destructive">
                              {connection.credentialError}
                            </p>
                          )}
                          {entries
                            .filter(
                              (entry) => entry.connection.id === connection.id,
                            )
                            .map((entry) => (
                              <ProviderModelStatus
                                key={connection.id}
                                entry={entry}
                              />
                            ))}
                          <div className="flex items-center gap-1">
                            <TooltipWrapper content="Default review connection">
                              <Button
                                variant={
                                  state.defaultId === connection.id
                                    ? "secondary"
                                    : "ghost"
                                }
                                size="icon"
                                aria-label={`${state.defaultId === connection.id ? "Clear default" : "Use by default"} ${info.label}`}
                                aria-pressed={state.defaultId === connection.id}
                                disabled={busy}
                                onClick={() =>
                                  void act({
                                    action: "default",
                                    id:
                                      state.defaultId === connection.id
                                        ? null
                                        : connection.id,
                                  })
                                }
                              >
                                <Star aria-hidden="true" />
                              </Button>
                            </TooltipWrapper>

                            <TooltipWrapper content="Delete connection">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${info.label} connection`}
                                disabled={busy}
                                onClick={() => setDeleting(connection.id)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </TooltipWrapper>
                            {state.defaultId === connection.id && (
                              <span className="flex gap-2 items-center text-primary">
                                <Check aria-hidden="true" className="size-4" />
                                Default review connection
                              </span>
                            )}
                          </div>
                          {deleting === connection.id && (
                            <div role="alert" className="space-y-2">
                              <p>
                                Delete this connection and its saved API key?
                              </p>
                              <Button
                                variant="destructive"
                                disabled={busy}
                                onClick={async () => {
                                  if (
                                    await act({
                                      action: "delete",
                                      id: connection.id,
                                    })
                                  ) {
                                    setDeleting(null);
                                    setFeedbackByConnection((current) => {
                                      const remaining = { ...current };
                                      delete remaining[connection.id];
                                      return remaining;
                                    });
                                  }
                                }}
                              >
                                Confirm deletion
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => setDeleting(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {info.keyRequired ? (
                      <ProviderKeyForm
                        provider={provider}
                        connection={connection}
                        onSaved={load}
                        initialFeedback={
                          connection
                            ? feedbackByConnection[connection.id]
                            : null
                        }
                        onFeedback={rememberFeedback}
                      />
                    ) : (
                      <Button
                        variant="outline"
                        className="justify-self-end text-base"
                        aria-label={`Configure ${info.label}`}
                        onClick={() =>
                          onConfigure(provider, connection, load, {
                            initialFeedback: connection
                              ? (feedbackByConnection[connection.id] ?? null)
                              : null,
                            onFeedback: rememberFeedback,
                          })
                        }
                      >
                        Configure
                        <ChevronRight aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
    </div>
  );
};
