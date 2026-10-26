"use client";

import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

export const useFormDraft = <
  T extends FieldValues,
  TOutput extends FieldValues = T,
>(
  form: UseFormReturn<T, unknown, TOutput>,
  key?: string,
) => {
  const { reset, watch } = form;
  const storageKey = key ? `senslop:draft:${key}` : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved =
        sessionStorage.getItem(storageKey) ?? localStorage.getItem(storageKey);
      if (saved) {
        const draft = JSON.parse(saved) as { values?: T; updatedAt?: number };
        if (
          draft.values &&
          draft.updatedAt &&
          Date.now() - draft.updatedAt < 30 * 86400000
        )
          reset(draft.values);
        else {
          sessionStorage.removeItem(storageKey);
          localStorage.removeItem(storageKey);
        }
      }
    } catch {}
    const subscription = watch((values) => {
      try {
        const body = JSON.stringify({ values, updatedAt: Date.now() });
        if (body.length < 1000000) {
          sessionStorage.setItem(storageKey, body);
          localStorage.setItem(storageKey, body);
        }
      } catch {}
    });
    return () => subscription.unsubscribe();
  }, [reset, watch, storageKey]);
  return {
    clear: () => {
      if (storageKey) {
        try {
          sessionStorage.removeItem(storageKey);
          localStorage.removeItem(storageKey);
        } catch {}
      }
    },
  };
};
