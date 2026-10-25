"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDebouncer } from "@tanstack/react-pacer/debouncer";
import {
  useWatch,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import {
  clearSettingsSaveStatus,
  setSettingsSaveStatus,
} from "../lib/settings-save-store";

type SettingsAutosaveOptions<
  TInput extends FieldValues,
  TOutput extends FieldValues,
> = {
  form: UseFormReturn<TInput, unknown, TOutput>;
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: TOutput } | { success: false };
  };
  save: (value: TOutput) => Promise<unknown>;
  enabled?: boolean;
  saveInitial?: boolean;
};

export const useSettingsAutosave = <
  TInput extends FieldValues,
  TOutput extends FieldValues,
>({
  form,
  schema,
  save,
  enabled = true,
  saveInitial = false,
}: SettingsAutosaveOptions<TInput, TOutput>) => {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const { getValues, trigger } = form;
  const handlers = useRef({ schema, save });
  useEffect(() => {
    handlers.current = { schema, save };
  }, [schema, save]);
  const signature = JSON.stringify(useWatch({ control: form.control }));
  const dirty = form.formState.isDirty;
  const defaults = JSON.stringify(form.formState.defaultValues);
  const runtime = useRef({
    confirmed: signature,
    initialPending: saveInitial,
    edited: false,
    defaults,
    queued: null as {
      signature: string;
      value: TOutput;
      save: typeof save;
    } | null,
    // A queued edit waits for Pacer even if an earlier save finishes first.
    ready: false,
    running: null as Promise<void> | null,
    valid: true,
    mounted: true,
  });
  const drain = useCallback(
    async function saveQueued(): Promise<void> {
      const state = runtime.current;
      if (state.running) return state.running.then(() => saveQueued());
      if (!state.ready) return;
      const job = state.queued;
      if (!job) return Promise.resolve();
      state.queued = null;
      state.ready = false;
      state.initialPending = false;
      if (state.mounted) setSaving(true);
      setSettingsSaveStatus(id, { status: "saving" });
      state.running = (async () => {
        try {
          await job.save(job.value);
          state.confirmed = job.signature;
          if (state.valid && !state.queued)
            setSettingsSaveStatus(id, { status: "saved" });
        } catch (error) {
          setSettingsSaveStatus(id, {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Your changes could not be saved.",
          });
        } finally {
          state.running = null;
          if (state.mounted) setSaving(false);
          if (state.queued && state.ready) void saveQueued();
          else if (state.queued)
            setSettingsSaveStatus(id, { status: "waiting" });
          else if (!state.mounted) clearSettingsSaveStatus(id);
        }
      })();
      return state.running.then(() => saveQueued());
    },
    [id],
  );
  const debouncer = useDebouncer(
    () => {
      runtime.current.ready = true;
      void drain();
    },
    { wait: 500 },
  );
  const flush = useCallback(() => {
    debouncer.cancel();
    runtime.current.ready = true;
    return drain();
  }, [debouncer, drain]);
  useEffect(() => {
    const state = runtime.current;
    const reset = defaults !== state.defaults;
    state.defaults = defaults;
    if (reset && !dirty && !state.initialPending) {
      debouncer.cancel();
      state.ready = false;
      state.queued = null;
      state.confirmed = signature;
      state.edited = false;
      if (!state.running) clearSettingsSaveStatus(id);
      return;
    }
    if (dirty) state.edited = true;
    if (!enabled || (!state.edited && !state.initialPending)) {
      if (!state.running && !state.queued) {
        state.confirmed = defaults ?? signature;
        clearSettingsSaveStatus(id);
      }
      return;
    }
    debouncer.cancel();
    state.ready = false;
    const parsed = handlers.current.schema.safeParse(getValues());
    state.valid = parsed.success;
    if (!parsed.success) {
      state.queued = null;
      setSettingsSaveStatus(id, { status: "invalid" });
      void trigger();
      return;
    }
    if (
      signature === state.confirmed &&
      !state.running &&
      !state.initialPending
    ) {
      state.queued = null;
      clearSettingsSaveStatus(id);
      return;
    }
    state.edited = true;
    if (state.queued?.signature !== signature)
      state.queued = {
        signature,
        value: parsed.data,
        save: handlers.current.save,
      };
    setSettingsSaveStatus(id, { status: state.running ? "saving" : "waiting" });
    debouncer.maybeExecute();
  }, [debouncer, defaults, dirty, enabled, getValues, id, signature, trigger]);
  useEffect(() => {
    const state = runtime.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      if (state.queued || state.running) void flush();
      else clearSettingsSaveStatus(id);
    };
  }, [flush, id]);
  return { flush, saving };
};
