import { expect, test } from "vitest";
import { createBuddyState, reduceBuddyState } from "../lib/buddy-state";
import { getBuddyPresentation } from "../lib/formatters";

test("a chat celebration settles back into any grouping still in progress", () => {
  let state = createBuddyState();
  state = reduceBuddyState(state, {
    type: "activity",
    id: "grouping",
    activity: "grouping",
  });
  state = reduceBuddyState(state, {
    type: "activity",
    id: "chat",
    activity: "thinking",
  });
  state = reduceBuddyState(state, {
    type: "activity",
    id: "chat",
    activity: null,
  });
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "response-1",
    mood: "happy",
    message: "Response ready.",
  });
  expect(getBuddyPresentation(state).mood).toBe("happy");
  state = reduceBuddyState(state, { type: "settle", id: "response-1" });
  expect(getBuddyPresentation(state).mood).toBe("grouping");
});

test("a failed operation takes priority over simultaneous successes and duplicate polling cannot replay it", () => {
  let state = reduceBuddyState(createBuddyState(), {
    type: "reaction",
    id: "failure",
    mood: "cry",
    message: "Grouping failed.",
  });
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "file",
    mood: "proud",
    message: "File complete.",
  });
  expect(state.reaction?.id).toBe("failure");
  state = reduceBuddyState(state, { type: "settle", id: "failure" });
  const settled = state;
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "failure",
    mood: "cry",
    message: "Grouping failed.",
  });
  expect(state).toBe(settled);
  expect(getBuddyPresentation(state).mood).toBe("idle");
});

test("a stale animation timer cannot dismiss a newer celebration", () => {
  let state = reduceBuddyState(createBuddyState(), {
    type: "reaction",
    id: "file",
    mood: "proud",
    message: "File complete.",
  });
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "review",
    mood: "celebrate",
    message: "Review complete!",
  });
  state = reduceBuddyState(state, { type: "settle", id: "file" });
  expect(state.reaction?.id).toBe("review");
});

test("hidden reactions are consumed without replay while ongoing activities remain available", () => {
  let state = reduceBuddyState(createBuddyState(), {
    type: "activity",
    id: "chat",
    activity: "thinking",
  });
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "hidden",
    mood: "celebrate",
    message: "Done!",
    silent: true,
  });
  expect(getBuddyPresentation(state).mood).toBe("thinking");
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "hidden",
    mood: "celebrate",
    message: "Done!",
  });
  expect(state.reaction).toBeNull();
});

test("a new message immediately replaces incidental feedback and a fast retry can still finish happily", () => {
  let state = reduceBuddyState(createBuddyState(), {
    type: "reaction",
    id: "hello",
    mood: "wave",
    message: "Hello.",
  });
  state = reduceBuddyState(state, {
    type: "activity",
    id: "chat",
    activity: "thinking",
  });
  expect(getBuddyPresentation(state).mood).toBe("thinking");
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "failed",
    mood: "cry",
    message: "Failed.",
  });
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "retry",
    mood: "retry",
    message: "Retrying.",
  });
  expect(getBuddyPresentation(state).mood).toBe("retry");
  state = reduceBuddyState(state, {
    type: "reaction",
    id: "ready",
    mood: "happy",
    message: "Ready.",
  });
  expect(getBuddyPresentation(state).mood).toBe("happy");
});
