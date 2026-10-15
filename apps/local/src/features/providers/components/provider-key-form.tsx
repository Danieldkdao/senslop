"use client";

import { useId, useRef, type BaseSyntheticEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  saveConnectionSchema,
  type SaveConnectionSchema,
  type ProviderId,
  type PublicConnectionSchema,
} from "@senslop/contracts";
import { useConnectionCheck } from "../hooks/use-connection-check";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/toast";
import { formatProvider } from "../lib/formatters";
import { providerRequest } from "../lib/requests";
import type { ConnectionFeedback } from "../types";

type ProviderKeyFormProps = {
  provider: ProviderId;
  connection?: PublicConnectionSchema;
  onSaved: () => Promise<void>;
  initialFeedback?: ConnectionFeedback | null;
  onFeedback?: (id: string, feedback: ConnectionFeedback | null) => void;
};

export const ProviderKeyForm = ({
  provider,
  connection,
  onSaved,
  initialFeedback,
  onFeedback,
}: ProviderKeyFormProps) => {
  const id = useId();
  const pending = useRef(false);
  const { feedback, checking, checkConnection } = useConnectionCheck({
    initialFeedback,
    onFeedback,
  });
  const info = formatProvider(provider);
  const {
    control,
    getValues,
    handleSubmit,
    resetField,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SaveConnectionSchema>({
    resolver: zodResolver(saveConnectionSchema),
    defaultValues: {
      provider,
      id: connection?.id,
      name: connection?.name ?? info.label,
      baseURL: connection?.baseURL ?? info.baseURL,
      model: connection?.model ?? "",
      contextWindow: null,
      apiKey: "",
    },
  });
  const submit = (event?: BaseSyntheticEvent) =>
    handleSubmit(async (values) => {
      if (!values.apiKey || pending.current) return;
      pending.current = true;
      try {
        const saved = await providerRequest<{
          connection: PublicConnectionSchema;
          warning?: string | null;
        }>({
          action: "save",
          connection: values,
        });
        setValue("id", saved.connection.id);
        resetField("apiKey", { defaultValue: "" });
        if (saved.warning) toast.error(saved.warning);
        else toast.success(`${info.label} API key saved securely.`);
        await checkConnection(saved.connection.id);
        await onSaved();
      } catch (failure) {
        setError("apiKey", { message: (failure as Error).message });
        toast.error((failure as Error).message);
      } finally {
        pending.current = false;
      }
    })(event);
  return (
    <form
      noValidate
      onSubmit={submit}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) void submit();
      }}
      className="flex flex-col gap-2"
      aria-busy={isSubmitting || checking}
    >
      <label className="sr-only" htmlFor={id}>
        {info.label} API key
      </label>
      <Controller
        name="apiKey"
        control={control}
        render={({ field }) => (
          <PasswordInput
            id={id}
            {...field}
            autoComplete="off"
            spellCheck={false}
            className="text-base"
            placeholder={
              connection?.configured
                ? "API key configured — enter a replacement"
                : "Enter API key"
            }
            aria-invalid={!!errors.apiKey}
            aria-describedby={
              errors.apiKey ? `${id}-help ${id}-error` : `${id}-help`
            }
            disabled={isSubmitting || checking}
          />
        )}
      />
      <p id={`${id}-help`} className="text-muted-foreground">
        {checking
          ? "Checking connection…"
          : isSubmitting
            ? "Saving securely…"
            : connection?.configured
              ? "API key configured in your OS credential store."
              : "Press Enter or leave the field to save securely."}
      </p>
      {feedback && (
        <p
          role={feedback.failed ? "alert" : "status"}
          className={cn(
            "text-muted-foreground",
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
      {errors.apiKey && (
        <p id={`${id}-error`} role="alert" className="text-destructive">
          {errors.apiKey.message} Your input is retained.
        </p>
      )}
    </form>
  );
};
