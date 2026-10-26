"use client";

import {
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
  type SetStateAction,
} from "react";

const readSaved = <T>(key: string, fallback: T): T => {
  try {
    const value = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export const useSavedState = <T>(name: string, fallback: T) => {
  const key = `senslop:view:${name}`;
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydrated,
    serverHydrated,
  );
  const [state, setState] = useState(() => ({
    key,
    value: fallback,
    loaded: false,
  }));
  if (hydrated && (!state.loaded || state.key !== key))
    setState({ key, value: readSaved(key, fallback), loaded: true });
  useEffect(() => {
    if (!state.loaded || state.key !== key) return;
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
        loaded: true,
        value:
          typeof next === "function"
            ? (next as (value: T) => T)(
                current.key === key && current.loaded
                  ? current.value
                  : readSaved(key, fallback),
              )
            : next,
      })),
    [key, fallback],
  );
  return [state.key === key ? state.value : fallback, setValue] as const;
};
