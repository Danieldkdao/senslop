"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { PublicConnectionSchema } from "@senslop/contracts";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { useSettingsAutosave } from "../../settings/hooks/use-settings-autosave";
import { toast } from "@/components/ui/toast";
import { useProviderModels } from "../hooks/use-provider-models";
import { providerRequest } from "../lib/requests";
import {
  compatibleProviderFormSchema,
  type CompatibleProviderFormSchema,
} from "../compatible-provider-schemas";
import { defaultCompatibleModel } from "../constants";
import { CompatibleModelFields } from "./compatible-model-fields";

type CompatibleProviderFormProps = {
  connection?: PublicConnectionSchema;
  onCancel: () => void;
  onSaved?: (connection: PublicConnectionSchema) => void;
};

export const CompatibleProviderForm = ({
  connection: initialConnection,
  onCancel,
  onSaved,
}: CompatibleProviderFormProps) => {
  const id = useId();
  const [saved, setSaved] = useState(initialConnection);
  const { settings, refresh } = useProviderModels();
  const latest = settings.data?.connections.find(
    (connection) => connection.id === saved?.id,
  );
  const connection =
    (latest?.revision ?? -1) > (saved?.revision ?? -1) ? latest : saved;
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);
  const schema = compatibleProviderFormSchema.superRefine((values, context) => {
    if (
      settings.data?.connections.some(
        (entry) =>
          entry.id !== connection?.id &&
          entry.name.trim().toLowerCase() === values.name.toLowerCase(),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "This provider name is already in use. Choose a unique name.",
      });
    if (!values.apiKey && !connection?.configured)
      context.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "Enter an API key for this provider.",
      });
    if (
      connection?.configured &&
      !values.apiKey &&
      values.baseURL.replace(/\/$/, "") !==
        connection.baseURL.replace(/\/$/, "")
    )
      context.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "Enter a new API key when changing the API URL.",
      });
  });
  const form = useForm<CompatibleProviderFormSchema>({
    resolver: zodResolver(schema),
    mode: "onChange",
    resetOptions: { keepDirtyValues: true },
    values: {
      provider: "openai-compatible",
      id: connection?.id,
      name: connection?.name ?? "",
      baseURL: connection?.baseURL ?? "",
      apiKey: "",
      model: "",
      contextWindow: null,
      models: connection?.models ?? [{ ...defaultCompatibleModel }],
      removeKey: false,
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "models",
  });
  const { errors } = form.formState;
  const autosave = useSettingsAutosave({
    form,
    schema,
    save: async (values) => {
      try {
        const result = await providerRequest<{
          connection: PublicConnectionSchema;
          warning: string | null;
        }>({
          action: "save",
          connection: { ...values, id: connectionRef.current?.id ?? values.id },
        });
        const current = schema.safeParse(form.getValues());
        const unchanged =
          current.success &&
          JSON.stringify(current.data) === JSON.stringify(values);
        connectionRef.current = result.connection;
        setSaved(result.connection);
        if (unchanged)
          form.reset(
            { ...values, id: result.connection.id, apiKey: "" },
            { keepValues: true },
          );
        form.setValue("id", result.connection.id);
        if (form.getValues("apiKey") === values.apiKey)
          form.resetField("apiKey", { defaultValue: "" });
        if (result.warning) toast.error(result.warning);
        await refresh();
        try {
          await providerRequest({ action: "test", id: result.connection.id });
        } catch (error) {
          toast.error(
            `Provider saved, but its connection check failed. ${(error as Error).message}`,
          );
        }
        onSaved?.(result.connection);
      } catch (error) {
        const message = (error as Error).message;
        form.setError(
          message.startsWith("This provider name") ? "name" : "root",
          { message },
        );
        toast.error(message);
        throw error;
      }
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-6 text-base"
      onSubmit={(event) => {
        event.preventDefault();
        void autosave.flush();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          void autosave.flush();
      }}
    >
      <p className="text-muted-foreground">
        This provider will use an OpenAI-compatible API. Its models will be
        available in AI settings and chat.
      </p>
      <fieldset className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-name`}>Provider name</label>
          <p className="text-muted-foreground">
            A unique name used to identify this provider.
          </p>
          <Input
            id={`${id}-name`}
            className="text-base"
            placeholder="e.g. My inference server"
            {...form.register("name")}
            aria-invalid={!!errors.name}
            aria-describedby={`${id}-name-error`}
          />
          <FieldError
            id={`${id}-name-error`}
            errors={[errors.name]}
            className="text-base"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-url`}>API URL</label>
          <p className="text-muted-foreground">
            The API base URL, usually ending in /v1. Use HTTPS or HTTP on
            localhost.
          </p>
          <Input
            id={`${id}-url`}
            className="text-base"
            placeholder="https://api.openai.com/v1"
            {...form.register("baseURL")}
            aria-invalid={!!errors.baseURL}
            aria-describedby={`${id}-url-error`}
          />
          <FieldError
            id={`${id}-url-error`}
            errors={[errors.baseURL]}
            className="text-base"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-key`}>API key</label>
          <p className="text-muted-foreground">
            Stored in your system credential store, never in settings or the
            local database.{" "}
            {connection?.configured &&
              "Leave blank to keep the saved key. Changing the API URL requires a new key."}
          </p>
          <Controller
            name="apiKey"
            control={form.control}
            render={({ field }) => (
              <PasswordInput
                {...field}
                id={`${id}-key`}
                className="text-base"
                autoComplete="off"
                aria-invalid={!!errors.apiKey}
                aria-describedby={`${id}-key-error`}
              />
            )}
          />
          <FieldError
            id={`${id}-key-error`}
            errors={[errors.apiKey]}
            className="text-base"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Models</h3>
          <Button
            type="button"
            variant="outline"
            className="text-base"
            disabled={fields.length >= 100}
            onClick={() => append({ ...defaultCompatibleModel })}
          >
            Add model
          </Button>
        </div>
        <FieldError errors={[errors.models?.root]} className="text-base" />
        {fields.map((field, index) => (
          <CompatibleModelFields
            key={field.id}
            id={`${id}-${field.id}`}
            index={index}
            form={form}
            canRemove={fields.length > 1}
            onRemove={() => remove(index)}
          />
        ))}
      </fieldset>
      <FieldError errors={[errors.root]} className="text-base" />
      <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background py-3">
        <Button
          type="button"
          className="text-base"
          variant="outline"
          onClick={onCancel}
        >
          Done
        </Button>
      </div>
    </form>
  );
};
