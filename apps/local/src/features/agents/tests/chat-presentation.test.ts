import { expect, test } from "vitest";
import {
  formatChatDuration,
  formatChatStep,
  formatChatDate,
} from "../lib/formatters";
import { getChatPresentation } from "../lib/messages";
import type { AgentMessage } from "../types";

test.each([
  [1000, "1s"],
  [59000, "59s"],
  [64000, "1m 4s"],
  [3544000, "59m 4s"],
  [3664000, "1h 1m 4s"],
])("thinking duration %s is readable", (duration, label) => {
  expect(formatChatDuration(duration)).toBe(label);
});

test("repository activity distinguishes running, completed, and failed tools", () => {
  expect(formatChatStep("askContext", "running").label).toBe("Reading context");
  expect(formatChatStep("askContext", "complete").label).toBe("Read context");
  expect(formatChatStep("readSource", "failed")).toMatchObject({
    className: "text-destructive",
  });
  expect(formatChatStep("reasoning", "running").label).toBe("Thinking…");
  expect(formatChatDate("2026-10-12T15:00:00Z")).toContain("Oct 12, 2026");
});

test("only the latest reasoning is exposed while earlier commentary and tools stay in activity", () => {
  const message: AgentMessage = {
    id: "answer",
    role: "assistant",
    parts: [
      { type: "step-start" },
      { type: "reasoning", text: "First thought", state: "done" },
      { type: "text", text: "Let me inspect this", state: "done" },
      {
        type: "tool-readSource",
        toolCallId: "read",
        state: "output-available",
        input: { path: "a.ts" },
        output: "source",
      },
      { type: "step-start" },
      { type: "reasoning", text: "Current thought", state: "streaming" },
    ],
  };
  const thinking = getChatPresentation(message, true);
  expect(thinking.answer).toBe("");
  expect(thinking.liveReasoning?.text).toBe("Current thought");
  expect(thinking.activity.map((step) => step.text)).toContain("First thought");
  message.parts.push({
    type: "text",
    text: "Final answer",
    state: "streaming",
  });
  const final = getChatPresentation(message, true);
  expect(final.answer).toBe("Final answer");
  expect(final.answerStarted).toBe(true);
  expect(final.liveReasoning).toBeUndefined();
  expect(
    final.activity.some((step) => step.text === "Let me inspect this"),
  ).toBe(true);
});

test("a saved turn ending with tools keeps its progress statement in activity rather than presenting it as the final answer", () => {
  const progress = "Let me check a couple of final details.";
  const message: AgentMessage = {
    id: "legacy",
    role: "assistant",
    parts: [
      { type: "step-start" },
      { type: "text", text: progress, state: "done" },
      {
        type: "tool-diagnostics",
        toolCallId: "diagnose",
        state: "output-available",
        input: { paths: ["a.ts"] },
        output: [],
      },
    ],
  };
  const result = getChatPresentation(message, false);
  expect(result.answer).toBe("");
  expect(result.activity.some((step) => step.text === progress)).toBe(true);
});
