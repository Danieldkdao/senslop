"use client";

import { useEffect, useState, useCallback, type SetStateAction } from "react";

const readSaved = <T>(key: string, fallback: T): T => {
  try {
    const value = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const useSavedState = <T>(name: string, fallback: T) => {
  const key = `senslop:view:${name}`;
  const [state, setState] = useState(() => ({
    key,
    value: readSaved(key, fallback),
  }));
  if (state.key !== key) setState({ key, value: readSaved(key, fallback) });
  useEffect(() => {
    if (state.key !== key) return;
    try {
      const value = JSON.stringify(state.value);
      sessionStorage.setItem(key, value);
      localStorage.setItem(key, value);
    } catch {}
  }, [key, state]);
  const setValue = useCallback(
    (next: SetStateAction<T>) =>
      setState((current) => ({
        key,
        value:
          typeof next === "function"
            ? (next as (value: T) => T)(current.value)
            : next,
      })),
    [key],
  );
  return [state.key === key ? state.value : fallback, setValue] as const;
};
