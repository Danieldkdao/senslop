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
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/toast";
import { formatProvider } from "../lib/formatters";
import { providerRequest } from "../lib/requests";
import type { ProviderConnectionStatus } from "../types";

type ProviderKeyFormProps = {
  provider: ProviderId;
  connection?: PublicConnectionSchema;
  onSaved: () => Promise<void>;
  onStatusChange?: (status: ProviderConnectionStatus) => void;
};

export const ProviderKeyForm = ({
  provider,
  connection,
  onSaved,
  onStatusChange,
}: ProviderKeyFormProps) => {
  const id = useId();
  const pending = useRef(false);
  const info = formatProvider(provider);
  const {
    control,
    handleSubmit,
    resetField,
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
      let failureMessage: string | null = null;
      onStatusChange?.({ busy: true, error: null });
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
        await onSaved();
      } catch (failure) {
        failureMessage = (failure as Error).message;
        toast.error((failure as Error).message);
      } finally {
        pending.current = false;
        onStatusChange?.({ busy: false, error: failureMessage });
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
      aria-busy={isSubmitting}
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
            disabled={isSubmitting}
          />
        )}
      />
      <p id={`${id}-help`} className="text-muted-foreground">
        {isSubmitting
          ? "Saving securely…"
          : connection?.configured
            ? "API key configured in your OS credential store."
            : "Press Enter or leave the field to save securely."}
      </p>
      {errors.apiKey && (
        <p id={`${id}-error`} role="alert" className="text-destructive">
          {errors.apiKey.message} Your input is retained.
        </p>
      )}
    </form>
  );
};
