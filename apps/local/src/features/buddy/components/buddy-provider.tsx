"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useUiPreferences } from "../../settings/hooks/use-ui-preferences";
import { createBuddyState, reduceBuddyState } from "../lib/buddy-state";
import { getBuddyReactionTiming } from "../lib/formatters";
import type { BuddyEvent } from "../types";
import { FloatingBuddy } from "./floating-buddy";

const BuddyContext = createContext<(event: BuddyEvent) => void>(() => {});

export const BuddyProvider = ({ children }: { children: ReactNode }) => {
  const ui = useUiPreferences();
  const enabled = !!ui.preferences.data && ui.values.buddy.visible;
  const [state, dispatch] = useReducer(
    reduceBuddyState,
    undefined,
    createBuddyState,
  );
  const visible = useRef(enabled);
  const welcomed = useRef(false);
  const previousTheme = useRef<string | null>(null);
  useEffect(() => {
    visible.current = enabled;
  }, [enabled]);
  const report = useCallback((event: BuddyEvent) => {
    dispatch(
      event.type === "reaction"
        ? {
            ...event,
            silent: event.silent || !visible.current || document.hidden,
          }
        : event,
    );
  }, []);
  useEffect(() => {
    if (!enabled || welcomed.current) return;
    welcomed.current = true;
    report({
      type: "reaction",
      id: "session-welcome",
      mood: "wave",
      message: "Pip is here with you.",
    });
  }, [enabled, report]);
  useEffect(() => {
    const theme = ui.values.applicationTheme;
    if (!ui.preferences.data || theme === null) return;
    if (previousTheme.current !== null && previousTheme.current !== theme)
      report({
        type: "reaction",
        id: crypto.randomUUID(),
        mood: "theme",
        message: "A fresh look for both of us.",
      });
    previousTheme.current = theme;
  }, [ui.preferences.data, ui.values.applicationTheme, report]);
  useEffect(() => {
    const reaction = state.reaction;
    if (!reaction) return;
    if (!enabled) {
      dispatch({ type: "settle", id: reaction.id });
      return;
    }
    const timer = setTimeout(
      () => dispatch({ type: "settle", id: reaction.id }),
      getBuddyReactionTiming(reaction.mood).duration,
    );
    return () => clearTimeout(timer);
  }, [state.reaction, enabled]);
  return (
    <BuddyContext value={report}>
      {children}
      {enabled && (
        <FloatingBuddy
          state={state}
          preferences={ui.values.buddy}
          save={ui.save}
        />
      )}
    </BuddyContext>
  );
};

export const useBuddy = () => {
  const context = useContext(BuddyContext);
  if (!context)
    throw new Error("BuddyContext must be used inside of the buddy provider.");

  return context;
};
