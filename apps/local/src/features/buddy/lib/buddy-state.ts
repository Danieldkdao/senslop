import type { BuddyEvent, BuddyState } from "../types";
import { getBuddyReactionTiming } from "./formatters";

export const createBuddyState = (): BuddyState => ({
  activities: {},
  reaction: null,
  seen: [],
});

export const reduceBuddyState = (
  state: BuddyState,
  event: BuddyEvent,
): BuddyState => {
  switch (event.type) {
    case "activity": {
      if (state.activities[event.id] === (event.activity ?? undefined))
        return state;
      const activities = { ...state.activities };
      if (event.activity) activities[event.id] = event.activity;
      else delete activities[event.id];
      const incidental =
        state.reaction &&
        (state.reaction.mood === "wave" ||
          state.reaction.mood === "theme" ||
          state.reaction.mood === "happy" ||
          state.reaction.mood === "proud");
      return {
        ...state,
        activities,
        reaction: event.activity && incidental ? null : state.reaction,
      };
    }
    case "reaction": {
      if (state.seen.includes(event.id)) return state;
      const seen = [...state.seen.slice(-255), event.id];
      const priority = getBuddyReactionTiming(event.mood).priority;
      if (
        event.silent ||
        (state.reaction &&
          event.mood !== "retry" &&
          state.reaction.mood !== "retry" &&
          priority < getBuddyReactionTiming(state.reaction.mood).priority)
      )
        return { ...state, seen };
      return {
        ...state,
        seen,
        reaction: { id: event.id, mood: event.mood, message: event.message },
      };
    }
    case "settle":
      return state.reaction?.id === event.id
        ? { ...state, reaction: null }
        : state;
  }
};
