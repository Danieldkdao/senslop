// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ChatMessage } from "../components/chat-message";
import type { AgentMessage } from "../types";
vi.mock("../components/agent-markdown", () => ({
  AgentMarkdown: ({ children }: { children: string }) => <p>{children}</p>,
}));
afterEach(cleanup);
const message: AgentMessage = {
  id: "answer",
  role: "assistant",
  metadata: { thinkingDurationMs: 64000 },
  parts: [
    { type: "step-start" },
    { type: "reasoning", text: "Earlier thought", state: "done" },
    {
      type: "tool-readSource",
      toolCallId: "read",
      state: "output-error",
      input: { path: "a.ts" },
      errorText: "Source unavailable",
    },
    { type: "step-start" },
    { type: "reasoning", text: "Current thought", state: "streaming" },
  ],
};

test("reasoning stays in its collapsed Trace content and only regular text appears outside", async () => {
  const mounted = render(<ChatMessage message={message} busy />);
  expect(screen.getAllByRole("button", { name: /Thinking/ })).toHaveLength(1);
  expect(screen.queryByText("Earlier thought")).toBeNull();
  expect(screen.queryByText("Current thought")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Thinking/ }));
  expect(screen.getAllByText("Current thought")).toHaveLength(1);
  expect(
    screen
      .getByText("Current thought")
      .closest('[data-slot="trace-collapsible-content"]'),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Current reasoning")).toBeNull();
  expect(
    screen.getByRole("region", { name: "Thinking and tool history" }).className,
  ).not.toContain("max-h-72");
  expect(screen.queryByText("Source unavailable")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Read source.*failed/ }));
  expect(screen.getByText("Source unavailable").className).toContain(
    "text-destructive",
  );
  const final = {
    ...message,
    parts: [
      ...message.parts,
      {
        type: "text" as const,
        text: "Final answer",
        state: "streaming" as const,
      },
    ],
  };
  mounted.rerender(<ChatMessage message={final} busy />);
  expect(screen.getByText("Final answer")).toBeTruthy();
  expect(
    screen.getByText("Final answer").closest('[data-slot="trace"]'),
  ).toBeNull();
  expect(
    screen
      .getByRole("button", { name: /Writing response/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  mounted.rerender(<ChatMessage message={final} busy={false} />);
  const finished = screen.getByRole("button", {
    name: "Worked for 1m 4s",
  });
  expect(finished.getAttribute("aria-expanded")).toBe("false");
  await userEvent.setup().click(finished);
  expect(
    screen.getByRole("region", { name: "Thinking and tool history" }).className,
  ).toContain("max-h-72");
  expect(screen.queryByText("Earlier thought")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getAllByRole("button", { name: "Finished thinking" })[0]!);
  expect(
    screen
      .getAllByRole("button", { name: "Finished thinking" })[0]!
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(screen.getByText("Earlier thought")).toBeTruthy();
  expect(screen.getByText("Current thought")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy response" })).toBeTruthy();
});

test("user messages show a sent timestamp and never have an assistant copy action", () => {
  render(
    <ChatMessage
      message={{
        id: "user",
        role: "user",
        metadata: { createdAt: "2026-10-12T15:00:00Z" },
        parts: [{ type: "text", text: "Question" }],
      }}
      busy={false}
    />,
  );
  const article = screen.getByRole("article", { name: "Your message" });
  expect(article.className).toContain("ml-auto");
  expect(within(article).getByText(/Oct 12, 2026/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copy response" })).toBeNull();
});

test("substantive text-only replies retain a history trigger but short replies do not", async () => {
  const reply: AgentMessage = {
    id: "plain",
    role: "assistant",
    metadata: { thinkingDurationMs: 4000 },
    parts: [
      {
        type: "text",
        text: "A detailed explanation of the change. ".repeat(12),
      },
    ],
  };
  const mounted = render(<ChatMessage message={reply} busy={false} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Worked for 4s" }));
  expect(
    screen.getByText(
      "No reasoning or tool details were returned with this response.",
    ),
  ).toBeTruthy();
  mounted.rerender(
    <ChatMessage
      message={{ ...reply, parts: [{ type: "text", text: "Hello!" }] }}
      busy={false}
    />,
  );
  expect(screen.queryByRole("button", { name: /Worked for/ })).toBeNull();
});

test("live tools appear directly without a duplicate outer current-step trigger", async () => {
  const active: AgentMessage = {
    id: "tools",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-askContext",
        toolCallId: "context",
        state: "input-available",
        input: { query: "Find callers" },
      },
    ],
  };
  render(<ChatMessage message={active} busy />);
  const triggers = screen.getAllByRole("button", { name: "Reading context" });
  expect(triggers).toHaveLength(1);
  expect(screen.queryByText(/Find callers/)).toBeNull();
  await userEvent.setup().click(triggers[0]!);
  expect(screen.getByText(/Find callers/)).toBeTruthy();
  expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
});

test("Trace preserves expanded tool details when the answer folds the flat history", async () => {
  const active: AgentMessage = {
    id: "trace",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-readSource",
        toolCallId: "read",
        state: "input-available",
        input: { path: "a.ts" },
      },
    ],
  };
  const mounted = render(<ChatMessage message={active} busy />);
  const user = userEvent.setup();
  const triggers = screen.getAllByRole("button", { name: "Reading source" });
  await user.click(triggers[0]!);
  mounted.rerender(
    <ChatMessage message={{ ...active, parts: [...active.parts] }} busy />,
  );
  expect(
    screen
      .getByRole("button", { name: "Reading source" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  const final: AgentMessage = {
    ...active,
    metadata: { thinkingDurationMs: 5000 },
    parts: [
      { type: "step-start" },
      {
        type: "tool-readSource",
        toolCallId: "read",
        state: "output-available",
        input: { path: "a.ts" },
        output: "Frozen source",
      },
      { type: "step-start" },
      { type: "text", text: "Final answer", state: "done" },
    ],
  };
  mounted.rerender(<ChatMessage message={final} busy={false} />);
  await user.click(screen.getByRole("button", { name: "Worked for 5s" }));
  expect(
    screen
      .getByRole("button", { name: "Read source" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(screen.getByText("Frozen source")).toBeTruthy();
});

test("legacy saved tool-only endings explain that the agent did not produce its final answer", () => {
  render(
    <ChatMessage
      busy={false}
      message={{
        id: "legacy",
        role: "assistant",
        metadata: { status: "complete" },
        parts: [
          { type: "step-start" },
          { type: "text", text: "Let me check more.", state: "done" },
          {
            type: "tool-readSource",
            toolCallId: "read",
            state: "output-available",
            input: { path: "a.ts" },
            output: "source",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText(/stopped before its final answer/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copy response" })).toBeNull();
});
