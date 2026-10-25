import type { SettingsSaveSnapshot } from "../types";

const entries = new Map<string, SettingsSaveSnapshot>();
const listeners = new Set<() => void>();
const active = new Map<
  string,
  { count: number; revision: number; result?: SettingsSaveSnapshot }
>();
const initial: SettingsSaveSnapshot = { status: "idle" };
let snapshot = initial;
let saved = false;

const publish = () => {
  const values = [...entries.values()];
  const pending = ["error", "invalid", "saving", "waiting"].flatMap(
    (status) => values.find((value) => value.status === status) ?? [],
  )[0];
  const next: SettingsSaveSnapshot = pending ?? {
    status: saved ? "saved" : "idle",
  };
  if (next.status === snapshot.status && next.message === snapshot.message)
    return;
  snapshot = next;
  listeners.forEach((listener) => listener());
};

export const subscribeSettingsSave = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSettingsSaveSnapshot = () => snapshot;
export const getServerSettingsSaveSnapshot = () => initial;

export const setSettingsSaveStatus = (
  source: string,
  value: SettingsSaveSnapshot,
) => {
  if (value.status === "saved") saved = true;
  entries.set(source, value);
  publish();
};

export const clearSettingsSaveStatus = (source: string) => {
  entries.delete(source);
  publish();
};

export const trackSettingsSave = async <T>(
  source: string,
  save: () => Promise<T>,
): Promise<T> => {
  const state = active.get(source) ?? { count: 0, revision: 0 };
  const revision = ++state.revision;
  state.count++;
  active.set(source, state);
  setSettingsSaveStatus(source, { status: "saving" });
  let result: SettingsSaveSnapshot = { status: "saved" };
  try {
    return await save();
  } catch (error) {
    result = {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Your changes could not be saved.",
    };
    throw error;
  } finally {
    if (revision === state.revision) state.result = result;
    state.count--;
    if (!state.count) {
      setSettingsSaveStatus(source, state.result ?? result);
      active.delete(source);
    }
  }
};
