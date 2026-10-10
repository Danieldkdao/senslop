"use client";

import { useId, useRef, useState, type BaseSyntheticEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  saveConnectionSchema,
  type SaveConnectionSchema,
  type PublicConnectionSchema,
  type ProviderId,
} from "@senslop/contracts";
import { ProviderIcon } from "../../../components/provider-icon";
import { formatEndpointLocation, formatProvider } from "../lib/formatters";
import { providerRequest } from "../lib/requests";
import { useConnectionCheck } from "../hooks/use-connection-check";
import type { ConnectionFeedback } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/toast";

type ConnectionFormProps = {
  provider: ProviderId;
  connection?: PublicConnectionSchema;
  onSaved: () => Promise<void>;
  initialFeedback?: ConnectionFeedback | null;
  onFeedback?: (id: string, feedback: ConnectionFeedback | null) => void;
};

export const ConnectionForm = ({
  provider,
  connection: initialConnection,
  onSaved,
  initialFeedback,
  onFeedback,
}: ConnectionFormProps) => {
  const id = useId();
  const info = formatProvider(provider);
  const pending = useRef(false);
  const [connection, setConnection] = useState(initialConnection);
  const { feedback, checking, checkConnection } = useConnectionCheck({
    initialFeedback,
    onFeedback,
  });
  const {
    register,
    getValues,
    handleSubmit,
    control,
    setValue,
    resetField,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SaveConnectionSchema>({
    resolver: zodResolver(saveConnectionSchema),
    defaultValues: {
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
  const endpoint = useWatch({ control, name: "baseURL" });
  const submit = (event?: BaseSyntheticEvent) =>
    handleSubmit(async (values) => {
      if (pending.current) return;
      if (info.keyRequired && !values.apiKey && !connection?.configured) {
        setError("apiKey", { message: "Enter an API key for this provider." });
        return;
      }
      pending.current = true;
      try {
        const saved = await providerRequest<{
          connection: PublicConnectionSchema;
          warning: string | null;
        }>({
          action: "save",
          connection: values,
        });
        setValue("id", saved.connection.id);
        setConnection(saved.connection);
        setValue("removeKey", false);
        resetField("apiKey", { defaultValue: "" });
        if (saved.warning) toast.error(saved.warning);
        else toast.success("Connection saved locally.");
        await checkConnection(saved.connection.id);
        await onSaved();
      } catch (error) {
        setError("root", { message: (error as Error).message });
        toast.error((error as Error).message);
      } finally {
        pending.current = false;
      }
    })(event);
  const field = (name: "baseURL", label: string, type = "text") => (
    <div className="space-y-2">
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
      className="space-y-5 text-base"
      aria-busy={isSubmitting || checking}
    >
      <div className="flex items-center gap-3">
        <ProviderIcon
          aria-hidden="true"
          name={info.icon}
          size={28}
          className="text-muted-foreground"
        />
        <p className="text-muted-foreground">{info.description}</p>
      </div>
      {field("baseURL", "API base URL", "url")}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          {formatEndpointLocation(endpoint)}
        </p>
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
        <div className="space-y-2">
          <label htmlFor={`${id}-context`}>Context window</label>
          <Input
            id={`${id}-context`}
            type="number"
            className="text-base"
            placeholder="Discovered from server / model"
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
              ? "Sent as the server context size for generation. Leave blank to use its default."
              : "Limits input sent by this app; it does not resize the model loaded by your server. Leave blank to use its default."}
          </p>
        </div>
      )}
      <div
        className="space-y-2"
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
      {checking && <p role="status">Checking connection…</p>}
      {feedback && (
        <p
          role={feedback.failed ? "alert" : "status"}
          className={cn(
            "rounded-md border bg-muted p-3",
            feedback.failed && "text-destructive",
          )}
        >
          {feedback.message}
        </p>
      )}
      {feedback?.failed && (
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting || checking}
          onClick={() => {
            const connectionId = getValues("id");
            if (connectionId) void checkConnection(connectionId);
          }}
        >
          Retry connection check
        </Button>
      )}
      {errors.root && (
        <p role="alert" className="text-destructive">
          {errors.root.message} Your input is retained; retry saving when ready.
        </p>
      )}
      <Button type="submit" disabled={isSubmitting || checking}>
        {isSubmitting ? "Saving securely…" : "Save connection"}
      </Button>
    </form>
  );
};
