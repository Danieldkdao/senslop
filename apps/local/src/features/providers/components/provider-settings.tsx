"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import {
  providerIds,
  isSubscriptionProvider,
  type ProviderId,
  type PublicConnectionSchema,
} from "@senslop/contracts";
import { ProviderIcon } from "../../../components/provider-icon";
import { formatProvider } from "../lib/formatters";
import { providerRequest } from "../lib/requests";
import type { ProviderConnectionStatus } from "../types";
import { ProviderKeyForm } from "./provider-key-form";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useConfirm } from "@/hooks/use-confirm";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProviderModels } from "../hooks/use-provider-models";
import { ProviderModelStatus } from "./provider-model-status";
import { SubscriptionProvider } from "./subscription-provider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type ProviderSettingsProps = {
  search?: string;
  onConfigure: (
    provider: ProviderId,
    connection: PublicConnectionSchema | undefined,
  ) => void;
};

export const ProviderSettings = ({
  search = "",
  onConfigure,
}: ProviderSettingsProps) => {
  const { settings, entries, refresh } = useProviderModels();
  const state = settings.data;
  const [busy, setBusy] = useState(false);
  const [statuses, setStatuses] = useState<
    Record<string, ProviderConnectionStatus>
  >({});
  const updateStatus = useCallback(
    (key: string, status: ProviderConnectionStatus) => {
      setStatuses((current) =>
        current[key]?.busy === status.busy &&
        current[key]?.error === status.error
          ? current
          : { ...current, [key]: status },
      );
    },
    [],
  );
  const { confirm, ConfirmationDialog } = useConfirm(
    "Delete this connection?",
    "This removes the provider connection and its saved API key from this computer.",
  );
  const act = async (body: object) => {
    setBusy(true);
    try {
      const result = await providerRequest<{ warning?: string | null } | null>(
        body,
      );
      if (result?.warning) toast.error(result.warning);
      await refresh();
    } catch (failure) {
      toast.error((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 text-base">
      {ConfirmationDialog}
      <div className="flex justify-end gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="text-base"
                aria-label="Add provider"
              />
            }
          >
            <Plus aria-hidden="true" />
            Add provider
            <ChevronDown aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-base">
                Compatible APIs
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="text-base"
                onClick={() => onConfigure("openai-compatible", undefined)}
              >
                <ProviderIcon name="OpenAI" size={20} aria-hidden="true" />
                OpenAI
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-muted-foreground">
        Choose task models in AI settings and chat models in the agent panel.
        API keys are saved in your OS credential store; configuration stays on
        this computer.
      </p>
      {settings.isPending && <p role="status">Loading local connections…</p>}
      {settings.error && (
        <div role="alert" className="flex flex-col gap-2">
          <p>{settings.error.message}</p>
          <Button variant="outline" onClick={() => void settings.refetch()}>
            Retry settings
          </Button>
        </div>
      )}
      {state?.cleanupPending && (
        <div role="alert" className="flex flex-col gap-2">
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
        [...providerIds]
          .sort(
            (a, b) =>
              Number(b === "openai-compatible") -
              Number(a === "openai-compatible"),
          )
          .filter(
            (provider) =>
              provider !== "openai-compatible" ||
              state.connections.some(
                (connection) => connection.provider === provider,
              ),
          )
          .map((provider) => {
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
                  !`providers api key model endpoint ${info.label} ${connections.map((connection) => connection.name).join(" ")}`
                    .toLowerCase()
                    .includes(search)
                }
                id={`settings-provider-${provider}`}
                className="flex flex-col gap-6 border-b pb-6"
                aria-label={`${info.label} connections`}
              >
                {options.map((connection) => {
                  const key = connection?.id ?? provider;
                  const label =
                    provider === "openai-compatible"
                      ? (connection?.name ?? info.label)
                      : info.label;
                  const entry = entries.find(
                    (entry) => entry.connection.id === connection?.id,
                  );

                  const connectedProviderOptions = connection ? (
                    <span className="inline-flex items-center gap-1">
                      <TooltipWrapper content="Default review connection">
                        <Button
                          variant={
                            state.defaultId === connection.id
                              ? "secondary"
                              : "ghost"
                          }
                          size="icon"
                          className="size-7"
                          aria-label={`${state.defaultId === connection.id ? "Clear default" : "Use by default"} ${label}`}
                          aria-pressed={state.defaultId === connection.id}
                          disabled={busy || statuses[key]?.busy}
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
                          className="size-7"
                          aria-label={`Delete ${label} connection`}
                          disabled={busy || statuses[key]?.busy}
                          onClick={async () => {
                            if (await confirm())
                              await act({
                                action: "delete",
                                id: connection.id,
                              });
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </TooltipWrapper>
                    </span>
                  ) : undefined;

                  return (
                    <div key={key} className="flex min-w-0 flex-col gap-3">
                      <h3 className="flex flex-wrap items-center gap-2 text-base font-medium text-muted-foreground">
                        <ProviderIcon
                          aria-hidden="true"
                          name={info.icon}
                          size={22}
                        />
                        <span>{label}</span>
                        <ProviderModelStatus
                          provider={provider}
                          connection={connection}
                          entry={entry}
                          status={statuses[key] ?? statuses[provider]}
                          onRefresh={async () => {
                            updateStatus(key, { busy: false, error: null });
                            if (entry) await entry.refetch();
                            else await refresh();
                          }}
                        />
                      </h3>
                      {isSubscriptionProvider(provider) ? (
                        <div className="grid gap-4 items-start md:grid-cols-2">
                          <div className="w-full min-w-0 col-span-2">
                            <SubscriptionProvider
                              provider={provider}
                              connection={connection}
                              onSaved={refresh}
                              onStatusChange={(status) =>
                                updateStatus(key, status)
                              }
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            {connectedProviderOptions}
                          </div>
                        </div>
                      ) : (
                        <div className="grid items-start gap-4 md:grid-cols-2">
                          <div className="flex flex-col gap-1 items-start">
                            <p className="font-medium">
                              {info.keyRequired &&
                              provider !== "openai-compatible"
                                ? "API key"
                                : "Configure provider"}
                            </p>
                            <p className="text-muted-foreground">
                              {info.description}
                            </p>
                            <div className="mt-1">
                              {connectedProviderOptions}
                            </div>
                          </div>
                          {info.keyRequired &&
                          provider !== "openai-compatible" ? (
                            <ProviderKeyForm
                              provider={provider}
                              connection={connection}
                              onSaved={refresh}
                              onStatusChange={(status) =>
                                updateStatus(key, status)
                              }
                            />
                          ) : (
                            <Button
                              variant="outline"
                              className="justify-self-end text-base"
                              aria-label={`Configure ${label}`}
                              onClick={() => onConfigure(provider, connection)}
                            >
                              Configure
                              <ChevronRight aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
    </div>
  );
};
