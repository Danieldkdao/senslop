import type { BuddyCharacter, BuddyMood, BuddyState } from "../types";

export const formatBuddyCharacter = (character: BuddyCharacter) => {
  switch (character) {
    case "pip":
      return { name: "Pip", spriteSheet: "/buddy/pip-poses.png" };
    case "momo":
      return { name: "Momo", spriteSheet: "/buddy/momo-poses.png" };
    case "nori":
      return { name: "Nori", spriteSheet: "/buddy/nori-poses.png" };
    case "lumi":
      return { name: "Lumi", spriteSheet: "/buddy/lumi-poses.png" };
    case "pebble":
      return { name: "Pebble", spriteSheet: "/buddy/pebble-poses.png" };
  }
};

export const getBuddyReactionTiming = (mood: BuddyMood) => {
  switch (mood) {
    case "retry":
      return { priority: 100, duration: 1000 };
    case "cry":
      return { priority: 90, duration: 3000 };
    case "dance":
      return { priority: 80, duration: 2800 };
    case "celebrate":
      return { priority: 70, duration: 1800 };
    case "happy":
      return { priority: 40, duration: 750 };
    case "proud":
      return { priority: 30, duration: 900 };
    case "wave":
      return { priority: 20, duration: 1600 };
    case "theme":
      return { priority: 10, duration: 1100 };
    case "landing":
      return { priority: 10, duration: 450 };
    case "pickup":
    case "idle":
    case "thinking":
    case "working":
    case "grouping":
    case "sleep":
    case "looking":
      return { priority: 0, duration: 1000 };
  }
};

export const getBuddyPresentation = (
  state: BuddyState,
): { mood: BuddyMood; message: string } => {
  if (state.reaction) return state.reaction;
  const activities = Object.values(state.activities);
  if (activities.includes("thinking"))
    return { mood: "thinking", message: "Thinking through your message…" };
  if (activities.includes("grouping"))
    return { mood: "grouping", message: "Organizing your changes…" };
  if (activities.includes("working"))
    return { mood: "working", message: "Reviewing your changes…" };
  return { mood: "idle", message: "Pip is here with you." };
};

export const getBuddyFrames = (
  mood: BuddyMood,
): { pose: number; duration: number }[] => {
  switch (mood) {
    case "idle":
      return [
        { pose: 0, duration: 3600 },
        { pose: 1, duration: 120 },
        { pose: 0, duration: 2200 },
        { pose: 15, duration: 650 },
      ];
    case "thinking":
      return [
        { pose: 2, duration: 950 },
        { pose: 3, duration: 850 },
        { pose: 1, duration: 120 },
      ];
    case "working":
      return [
        { pose: 4, duration: 1400 },
        { pose: 14, duration: 800 },
      ];
    case "grouping":
      return [
        { pose: 5, duration: 1200 },
        { pose: 3, duration: 500 },
      ];
    case "happy":
      return [
        { pose: 6, duration: 400 },
        { pose: 7, duration: 350 },
      ];
    case "celebrate":
    case "dance":
      return [
        { pose: 11, duration: 140 },
        { pose: 6, duration: 350 },
        { pose: 7, duration: 350 },
        { pose: 6, duration: 350 },
      ];
    case "cry":
      return [
        { pose: 8, duration: 1300 },
        { pose: 9, duration: 600 },
        { pose: 8, duration: 1000 },
      ];
    case "retry":
      return [
        { pose: 9, duration: 350 },
        { pose: 14, duration: 650 },
      ];
    case "pickup":
      return [{ pose: 10, duration: 1000 }];
    case "landing":
      return [
        { pose: 11, duration: 160 },
        { pose: 0, duration: 290 },
      ];
    case "wave":
      return [
        { pose: 12, duration: 450 },
        { pose: 0, duration: 250 },
        { pose: 12, duration: 450 },
      ];
    case "sleep":
      return [{ pose: 13, duration: 1000 }];
    case "proud":
      return [{ pose: 14, duration: 900 }];
    case "theme":
      return [
        { pose: 15, duration: 350 },
        { pose: 0, duration: 300 },
        { pose: 6, duration: 450 },
      ];
    case "looking":
      return [{ pose: 15, duration: 1000 }];
  }
};
