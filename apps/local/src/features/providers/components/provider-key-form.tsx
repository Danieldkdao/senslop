"use client";

import { useEffect, useId, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  saveConnectionSchema,
  type SaveConnectionSchema,
  type ProviderId,
  type PublicConnectionSchema,
} from "@senslop/contracts";
import { useSettingsAutosave } from "../../settings/hooks/use-settings-autosave";
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
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);
  const info = formatProvider(provider);
  const form = useForm<SaveConnectionSchema>({
    resolver: zodResolver(saveConnectionSchema),
    mode: "onChange",
    resetOptions: { keepDirtyValues: true },
    values: {
      provider,
      id: connection?.id,
      name: connection?.name ?? info.label,
      baseURL: connection?.baseURL ?? info.baseURL,
      model: connection?.model ?? "",
      contextWindow: null,
      apiKey: "",
    },
  });
  const {
    control,
    resetField,
    setValue,
    formState: { errors },
  } = form;
  const autosave = useSettingsAutosave({
    form,
    schema: saveConnectionSchema,
    save: async (values) => {
      if (!values.apiKey) return;
      let failureMessage: string | null = null;
      onStatusChange?.({ busy: true, error: null });
      try {
        const saved = await providerRequest<{
          connection: PublicConnectionSchema;
          warning?: string | null;
        }>({
          action: "save",
          connection: { ...values, id: connectionRef.current?.id ?? values.id },
        });
        connectionRef.current = saved.connection;
        setValue("id", saved.connection.id);
        if (form.getValues("apiKey") === values.apiKey) {
          form.reset(
            { ...values, id: saved.connection.id, apiKey: "" },
            { keepValues: true },
          );
          resetField("apiKey", { defaultValue: "" });
        }
        if (saved.warning) toast.error(saved.warning);
        await onSaved();
      } catch (failure) {
        failureMessage = (failure as Error).message;
        toast.error(failureMessage);
        throw failure;
      } finally {
        onStatusChange?.({ busy: false, error: failureMessage });
      }
    },
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void autosave.flush();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          void autosave.flush();
      }}
      className="flex flex-col gap-2"
      aria-busy={autosave.saving}
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
          />
        )}
      />
      <p id={`${id}-help`} className="text-muted-foreground">
        {autosave.saving
          ? "Saving securely…"
          : connection?.configured
            ? "API key configured in your OS credential store."
            : "Your key saves automatically in your OS credential store."}
      </p>
      {errors.apiKey && (
        <p id={`${id}-error`} role="alert" className="text-destructive">
          {errors.apiKey.message} Your input is retained.
        </p>
      )}
    </form>
  );
};
