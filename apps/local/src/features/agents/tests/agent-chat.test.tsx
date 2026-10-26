// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { AgentChat } from "../components/agent-chat";
import type { useAgentState } from "../hooks/use-agent-state";
const state = vi.hoisted(() => ({
  refresh: vi.fn(),
  act: vi.fn(),
  settings: undefined as unknown,
  entries: [] as unknown[],
}));
vi.mock("../hooks/use-ai-settings", () => ({
  useAiSettings: () => ({ settings: { data: state.settings } }),
}));
vi.mock("../../providers/hooks/use-provider-models", () => ({
  useProviderModels: () => ({ entries: state.entries }),
}));
vi.mock("../hooks/use-agent-state", () => ({
  useConversation: () => ({
    conversation: { data: null },
    refresh: state.refresh,
  }),
  useAgentHistory: () => ({ data: null }),
}));
vi.mock("../../providers/components/model-picker", () => ({
  ModelPicker: ({
    onChange,
    disabled,
    value,
  }: {
    onChange: (model: object) => void;
    disabled?: boolean;
    value?: { name: string } | null;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onChange({
          connectionId: "connection",
          modelId: "fixture",
          name: "Fixture",
        })
      }
    >
      Choose fixture{value && <span>{value.name}</span>}
    </button>
  ),
}));
vi.mock("../components/agent-markdown", () => ({
  AgentMarkdown: ({ children }: { children: string }) => <p>{children}</p>,
}));
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  state.settings = undefined;
  state.entries = [];
});
const response = (fail = false) =>
  createUIMessageStreamResponse({
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "start", messageId: "assistant" });
        controller.enqueue({ type: "text-start", id: "text" });
        controller.enqueue({
          type: "text-delta",
          id: "text",
          delta: fail ? "Partial answer" : "Complete answer",
        });
        if (fail)
          controller.enqueue({
            type: "error",
            errorText: "Provider unavailable",
          });
        else {
          controller.enqueue({ type: "text-end", id: "text" });
          controller.enqueue({ type: "finish", finishReason: "stop" });
        }
        controller.close();
      },
    }),
  });

test("SDK chat streams the first turn, clears successful drafts, and retains failed drafts for retry", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  state.act.mockResolvedValue({
    id,
    snapshotId: id,
    title: "New conversation",
    updatedAt: new Date().toISOString(),
    model: null,
    messages: [],
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetcher);
  const agents = {
    state: { data: { conversations: [] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  render(<AgentChat snapshotId={id} agents={agents} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Choose fixture"));
  const composer = () =>
    screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
  await user.type(composer(), "Why does this change?");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Complete answer");
  await waitFor(() => expect(state.refresh).toHaveBeenCalledWith(id));
  await waitFor(() => expect(composer().value).toBe(""));
  const firstBody = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(firstBody).toMatchObject({
    conversationId: id,
    content: "Why does this change?",
    model: { modelId: "fixture" },
  });
  expect(firstBody.messageId).toBeTruthy();
  expect(firstBody.messages).toBeUndefined();
  await user.type(composer(), "Retry this question");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Partial answer");
  await screen.findAllByRole("alert");
  expect(composer().value).toBe("Retry this question");
  await user.click(screen.getByRole("button", { name: "Retry message" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetcher.mock.calls[2]![1].body).messageId).toBe(
    JSON.parse(fetcher.mock.calls[1]![1].body).messageId,
  );
  await waitFor(() => expect(composer().value).toBe(""));
});

test("chat cannot send until a conversation model is selected", async () => {
  const agents = {
    state: { data: { conversations: [] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  render(<AgentChat snapshotId="unconfigured" agents={agents} />);
  expect(
    screen
      .getByRole("button", { name: "Send message" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("textbox", { name: "Message" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText("Choose fixture").closest("form")).toBe(
    screen.getByRole("textbox", { name: "Message" }).closest("form"),
  );
  const user = userEvent.setup();
  await user.click(screen.getByText("Choose fixture"));
  expect(state.act).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Send message" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.type(
    screen.getByRole("textbox", { name: "Message" }),
    "Explain this",
  );
  expect(
    screen
      .getByRole("button", { name: "Send message" })
      .hasAttribute("disabled"),
  ).toBe(false);
});

test("stopping an active SDK stream restores Send and preserves the question", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  state.act.mockResolvedValue({
    id,
    snapshotId: id,
    title: "New conversation",
    updatedAt: new Date().toISOString(),
    model: null,
    messages: [],
  });
  let requestSignal: AbortSignal | undefined;
  const fetcher = vi.fn((_url: string, options: RequestInit) => {
    requestSignal = options.signal as AbortSignal;
    return Promise.resolve(
      createUIMessageStreamResponse({
        stream: new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant" });
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "Thinking about the change",
            });
            requestSignal?.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          },
        }),
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const agents = {
    state: { data: { conversations: [] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  render(<AgentChat snapshotId={id} agents={agents} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Choose fixture"));
  const input = screen.getByRole("textbox", {
    name: "Message",
  }) as HTMLTextAreaElement;
  await user.type(input, "Explain this diff");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Thinking about the change");
  expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Stop response" }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Send message" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(requestSignal?.aborted).toBe(true);
  expect(input.value).toBe("Explain this diff");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("conversation deletion uses a confirmation dialog and cancel preserves the conversation", async () => {
  state.act.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    snapshotId: "00000000-0000-4000-8000-000000000001",
    title: "New conversation",
    updatedAt: new Date().toISOString(),
    model: null,
    messages: [],
  });
  const agents = {
    state: { data: { conversations: [] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  render(<AgentChat snapshotId="snapshot" agents={agents} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New conversation" }));
  await user.click(
    await screen.findByRole("button", { name: "Delete conversation" }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Delete this conversation?" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(state.act.mock.calls.some(([body]) => body.action === "delete")).toBe(
    false,
  );
  await user.click(screen.getByRole("button", { name: "Delete conversation" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(state.act).toHaveBeenCalledWith({
      action: "delete",
      id: "00000000-0000-4000-8000-000000000001",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Delete conversation" }),
    ).toBeNull(),
  );
});

test.each([false, true])(
  "chat defaults to the configured task model when separate is %s",
  async (separate) => {
    state.settings = {
      separate,
      shared: {
        connectionId: "shared",
        modelId: "shared",
        name: "Shared default",
      },
      roles: {
        review: {
          connectionId: "review",
          modelId: "review",
          name: "Review default",
        },
      },
    };
    const agents = {
      state: { data: { conversations: [] } },
      act: state.act,
    } as unknown as ReturnType<typeof useAgentState>;
    render(<AgentChat snapshotId="snapshot" agents={agents} />);
    expect(
      await screen.findByText(separate ? "Review default" : "Shared default"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Send message" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await userEvent
      .setup()
      .type(screen.getByRole("textbox", { name: "Message" }), "Explain this");
    expect(
      screen
        .getByRole("button", { name: "Send message" })
        .hasAttribute("disabled"),
    ).toBe(false);
  },
);

test("updated task settings change the default without overwriting an explicit chat choice", async () => {
  state.settings = {
    separate: false,
    shared: {
      connectionId: "shared",
      modelId: "first",
      name: "Initial default",
    },
    roles: { review: null },
  };
  const agents = {
    state: { data: { conversations: [] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  const mounted = render(<AgentChat snapshotId="snapshot" agents={agents} />);
  expect(await screen.findByText("Initial default")).toBeTruthy();
  state.settings = {
    separate: false,
    shared: { connectionId: "shared", modelId: "new", name: "Updated default" },
    roles: { review: null },
  };
  mounted.rerender(<AgentChat snapshotId="snapshot" agents={agents} />);
  expect(await screen.findByText("Updated default")).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Choose fixture/ }));
  state.settings = {
    separate: true,
    shared: null,
    roles: {
      review: {
        connectionId: "review",
        modelId: "review",
        name: "Review default",
      },
    },
  };
  mounted.rerender(<AgentChat snapshotId="snapshot" agents={agents} />);
  expect(screen.getByText("Fixture")).toBeTruthy();
});

test("chat waits for task settings, chooses the first loaded available model, and preserves that selection as more catalogs load", async () => {
  state.entries = [
    {
      connection: { id: "mistral", provider: "mistral" },
      catalog: {
        models: [
          { id: "unavailable", name: "Unavailable", available: false },
          { id: "first", name: "First loaded", available: true },
        ],
      },
      pending: false,
      error: null,
    },
  ];
  const agents = {
    state: { data: { conversations: [] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  const mounted = render(<AgentChat snapshotId="snapshot" agents={agents} />);
  expect(screen.queryByText("First loaded")).toBeNull();
  state.settings = { separate: false, shared: null, roles: { review: null } };
  mounted.rerender(<AgentChat snapshotId="snapshot" agents={agents} />);
  expect(await screen.findByText("First loaded")).toBeTruthy();
  state.entries = [
    ...state.entries,
    {
      connection: { id: "earlier", provider: "openrouter" },
      catalog: {
        models: [{ id: "later", name: "Loaded later", available: true }],
      },
      pending: false,
      error: null,
    },
  ];
  mounted.rerender(<AgentChat snapshotId="snapshot" agents={agents} />);
  expect(screen.getByText("First loaded")).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Choose fixture/ }));
  expect(screen.getByText("Fixture")).toBeTruthy();
});

test("history deletes a conversation without selecting it and keeps the list open", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  const agents = {
    state: { data: { conversations: [{ id: "saved", title: "Saved chat" }] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  state.act.mockResolvedValue({ saved: true });
  render(<AgentChat snapshotId="snapshot" agents={agents} />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Conversation history" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Delete conversation Saved chat" }),
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(state.act).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Delete conversation Saved chat" }),
  );
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(state.act).toHaveBeenCalledWith({ action: "delete", id: "saved" }),
  );
  expect(screen.getByRole("dialog", { name: "Conversations" })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Rename conversation" }),
  ).toBeNull();
});

test("history renames a chat in a nested dialog without selecting it or closing history", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.act.mockResolvedValue({});
  const agents = {
    state: { data: { conversations: [{ id: "saved", title: "Saved chat" }] } },
    act: state.act,
  } as unknown as ReturnType<typeof useAgentState>;
  render(<AgentChat snapshotId="snapshot" agents={agents} />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Conversation history" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Rename conversation Saved chat" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Rename conversation" });
  expect(dialog).toBeTruthy();
  const input = screen.getByRole("textbox", { name: "Conversation title" });
  await user.clear(input);
  await user.type(input, "New chat name{Enter}");
  await waitFor(() =>
    expect(state.act).toHaveBeenCalledWith({
      action: "rename",
      id: "saved",
      title: "New chat name",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Rename conversation" }),
    ).toBeNull(),
  );
  expect(screen.getByRole("dialog", { name: "Conversations" })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Rename conversation" }),
  ).toBeNull();
});
