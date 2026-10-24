"use client";

import { useId, useRef, useState, type BaseSyntheticEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  saveConnectionSchema,
  defaultLocalContextWindow,
  type SaveConnectionSchema,
  type PublicConnectionSchema,
  type ProviderId,
} from "@senslop/contracts";
import { ProviderIcon } from "../../../components/provider-icon";
import { formatProvider } from "../lib/formatters";
import { providerRequest } from "../lib/requests";
import { useProviderModels } from "../hooks/use-provider-models";
import { ProviderModelStatus } from "./provider-model-status";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/toast";

type ConnectionFormProps = {
  provider: ProviderId;
  connection?: PublicConnectionSchema;
};

const formatContextWindow = (tokens: number) => tokens.toLocaleString("en-US");

export const ConnectionForm = ({
  provider,
  connection: initialConnection,
}: ConnectionFormProps) => {
  const id = useId();
  const info = formatProvider(provider);
  const pending = useRef(false);
  const [savedConnection, setConnection] = useState(initialConnection);
  const { settings, entries, refresh } = useProviderModels();
  const existingConnection = settings?.data?.connections.find(
    (connection) => connection.id === savedConnection?.id,
  );
  const connection =
    (existingConnection?.revision ?? -1) > (savedConnection?.revision ?? -1)
      ? existingConnection
      : savedConnection;
  const [saveError, setSaveError] = useState<string | null>(null);
  const entry = entries.find((entry) => entry.connection.id === connection?.id);
  const {
    register,
    getValues,
    handleSubmit,
    control,
    setValue,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SaveConnectionSchema>({
    resolver: zodResolver(saveConnectionSchema),
    resetOptions: { keepDirtyValues: true },
    values: {
      provider,
      id: connection?.id,
      name: connection?.name ?? info.label,
      baseURL: connection?.baseURL ?? info.baseURL,
      model: connection?.model ?? "",
      contextWindow: connection?.contextWindow ?? null,
      apiKey: "",
      removeKey: false,
    },
  });
  const submit = (event?: BaseSyntheticEvent) =>
    handleSubmit(async (values) => {
      if (pending.current) return;
      if (info.keyRequired && !values.apiKey && !connection?.configured) {
        setError("apiKey", { message: "Enter an API key for this provider." });
        return;
      }
      pending.current = true;
      setSaveError(null);
      try {
        const saved = await providerRequest<{
          connection: PublicConnectionSchema;
          warning: string | null;
        }>({
          action: "save",
          connection: values,
        });
        setConnection(saved.connection);
        reset(
          {
            ...values,
            id: saved.connection.id,
            apiKey: "",
            removeKey: false,
          },
          { keepDirtyValues: false },
        );
        if (saved.warning) toast.error(saved.warning);
        else toast.success("Connection saved locally.");
        await refresh();
      } catch (error) {
        setSaveError((error as Error).message);
        toast.error((error as Error).message);
      } finally {
        pending.current = false;
      }
    })(event);
  const field = (name: "baseURL", label: string, type = "text") => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      <Input
        id={`${id}-${name}`}
        type={type}
        className="text-base md:text-base"
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
        {...register(name)}
      />
      {errors[name] && (
        <p id={`${id}-${name}-error`} role="alert" className="text-destructive">
          {errors[name]?.message}
        </p>
      )}
    </div>
  );
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-5 text-base"
      aria-busy={isSubmitting}
    >
      <div className="flex flex-wrap items-center gap-3">
        <ProviderIcon
          aria-hidden="true"
          name={info.icon}
          size={28}
          className="text-muted-foreground"
        />
        <p className="min-w-0 flex-1 text-muted-foreground">
          {info.description}
        </p>
        <ProviderModelStatus
          provider={provider}
          connection={connection}
          entry={entry}
          status={{ busy: isSubmitting, error: saveError }}
          onRefresh={async () => {
            setSaveError(null);
            if (entry) await entry.refetch();
            else await refresh();
          }}
        />
      </div>
      {field("baseURL", "API base URL", "url")}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setValue("baseURL", info.baseURL, { shouldDirty: true })
          }
        >
          Use endpoint preset
        </Button>
      </div>
      {info.contextWindow && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-context`}>Context window</label>
          <Input
            id={`${id}-context`}
            type="number"
            className="text-base"
            placeholder={String(defaultLocalContextWindow)}
            {...register("contextWindow", {
              setValueAs: (value: string | number | null) =>
                value === "" || value === null ? null : Number(value),
            })}
            aria-invalid={!!errors.contextWindow}
            aria-describedby={
              errors.contextWindow ? `${id}-context-error` : undefined
            }
          />
          {errors.contextWindow && (
            <p
              id={`${id}-context-error`}
              role="alert"
              className="text-destructive"
            >
              {errors.contextWindow.message}
            </p>
          )}
          <p className="text-muted-foreground">
            {provider === "ollama"
              ? "When set, also configures the server context size for generation."
              : "Match the context length loaded in your server; this does not resize the loaded model."}{" "}
            Blank uses a {formatContextWindow(defaultLocalContextWindow)}-token
            default app budget. AI capacity settings can override this for new
            runs.
          </p>
        </div>
      )}
      <div
        className="flex flex-col gap-2"
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget) &&
            getValues("apiKey")
          )
            void submit();
        }}
      >
        <label htmlFor={`${id}-apiKey`}>API key</label>
        <Controller
          name="apiKey"
          control={control}
          render={({ field }) => (
            <PasswordInput
              {...field}
              id={`${id}-apiKey`}
              className="text-base md:text-base"
              autoComplete="off"
              spellCheck={false}
              disabled={isSubmitting}
              placeholder={
                connection?.configured
                  ? "Saved in OS credential store, leave blank to keep"
                  : undefined
              }
              aria-invalid={!!errors.apiKey}
              aria-describedby={
                errors.apiKey ? `${id}-apiKey-error` : undefined
              }
            />
          )}
        />
        {errors.apiKey && (
          <p
            id={`${id}-apiKey-error`}
            role="alert"
            className="text-destructive"
          >
            {errors.apiKey.message}
          </p>
        )}
      </div>
      <p className="text-muted-foreground">
        {info.keyRequired
          ? "Required"
          : "Optional for servers without authentication"}
      </p>
      {connection?.configured && !info.keyRequired && (
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("removeKey")} />
          Remove saved API key
        </label>
      )}
      <p className="text-muted-foreground">
        Saving checks the connection automatically using metadata only; no
        repository source is sent.
      </p>
      <Button
        type="submit"
        aria-label="Save connection"
        aria-busy={isSubmitting}
        disabled={isSubmitting}
      >
        <LoadingSwap isLoading={isSubmitting}>Save connection</LoadingSwap>
      </Button>
    </form>
  );
};
