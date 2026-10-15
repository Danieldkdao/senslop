// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { AgentForm } from "../components/agent-form";

const feedback = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));
vi.mock("../../providers/components/model-picker", () => ({
  ModelPicker: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      Model picker
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const model = {
  connectionId: "connection",
  modelId: "fixture",
  name: "Fixture",
};
const props = { model, onModelChange: vi.fn(), busy: false, onStop: vi.fn() };

test("agent composer validates questions and supports multiline and IME input without submitting", async () => {
  const onSend = vi.fn();
  render(<AgentForm {...props} onSend={onSend} />);
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", {
    name: "Message",
  }) as HTMLTextAreaElement;
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
  expect(onSend).not.toHaveBeenCalled();
  expect(screen.getByText("Enter a message before sending.")).toBeTruthy();
  await user.type(input, "Explain this");
  await user.keyboard("{Shift>}{Enter}{/Shift}");
  expect(input.value).toBe("Explain this\n");
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(onSend).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(onSend).toHaveBeenCalledWith("Explain this"));
  await waitFor(() => expect(input.value).toBe(""));
});

test("Stop replaces Send during a pending turn and failed or interrupted turns retain the draft", async () => {
  let rejectSend!: (error: Error) => void;
  const onSend = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        rejectSend = reject;
      }),
  );
  const onStop = vi.fn();
  const mounted = render(
    <AgentForm {...props} onStop={onStop} onSend={onSend} />,
  );
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", {
    name: "Message",
  }) as HTMLTextAreaElement;
  await user.type(input, "Keep my question");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  mounted.rerender(
    <AgentForm {...props} busy onStop={onStop} onSend={onSend} />,
  );
  expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  expect(screen.getByText("Model picker").hasAttribute("disabled")).toBe(true);
  expect(input.hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Stop response" }));
  expect(onStop).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSend).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectSend(new Error("Response interrupted"));
  });
  mounted.rerender(<AgentForm {...props} onStop={onStop} onSend={onSend} />);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Send message" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(input.value).toBe("Keep my question");
  expect(feedback.error).toHaveBeenCalledWith("Response interrupted");
});

test("a slow successful turn clears the visible draft and the next typed question submits", async () => {
  let finish!: () => void;
  const onSend = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const mounted = render(<AgentForm {...props} onSend={onSend} />);
  const input = screen.getByRole("textbox", {
    name: "Message",
  }) as HTMLTextAreaElement;
  const user = userEvent.setup();
  await user.type(input, "First question");
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(onSend).toHaveBeenCalledWith("First question"));
  mounted.rerender(<AgentForm {...props} busy onSend={onSend} />);
  mounted.rerender(<AgentForm {...props} onSend={onSend} />);
  await act(async () => {
    finish();
  });
  expect(input.value).toBe("");
  await user.type(input, "New question");
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(onSend).toHaveBeenLastCalledWith("New question"));
});
