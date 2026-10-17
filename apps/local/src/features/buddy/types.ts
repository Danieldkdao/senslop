import type { buddyMoods } from "./constants";

export type BuddyMood = (typeof buddyMoods)[number];
export type BuddyActivity = "thinking" | "working" | "grouping";
export type BuddyPosition = { x: number; y: number };
export type BuddyViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type BuddyReaction = { id: string; mood: BuddyMood; message: string };
export type BuddyEvent =
  | { type: "activity"; id: string; activity: BuddyActivity | null }
  | ({ type: "reaction"; silent?: boolean } & BuddyReaction)
  | { type: "settle"; id: string };
export type BuddyState = {
  activities: Record<string, BuddyActivity>;
  reaction: BuddyReaction | null;
  seen: string[];
};
