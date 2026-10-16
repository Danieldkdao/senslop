// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { AiTestChat } from "../components/ai-test-chat";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("../../providers/components/model-picker", () => ({
  ModelPicker: ({
    onChange,
    disabled,
  }: {
    onChange: (selection: {
      connectionId: string;
      modelId: string;
      name: string;
    }) => void;
    disabled: boolean;
  }) => (
    <>
      <button
        disabled={disabled}
        onClick={() =>
          onChange({
            connectionId: "00000000-0000-4000-8000-000000000001",
            modelId: "first",
            name: "First",
          })
        }
      >
        Choose first
      </button>
      <button
        disabled={disabled}
        onClick={() =>
          onChange({
            connectionId: "00000000-0000-4000-8000-000000000002",
            modelId: "second",
            name: "Second",
          })
        }
      >
        Choose second
      </button>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("sends a conversation, displays the reply, and resets when switching providers", async () => {
  const calls: { connectionId: string; messages: unknown[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return Response.json({ text: "A real-shaped reply" });
    }),
  );
  const user = userEvent.setup();
  render(<AiTestChat />);
  await user.click(screen.getByRole("button", { name: "Choose first" }));
  await user.type(screen.getByLabelText("Message"), "Hello");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("A real-shaped reply")).toBeTruthy();
  await user.type(screen.getByLabelText("Message"), "Again");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1].messages).toHaveLength(3);
  await waitFor(() =>
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe(
      "",
    ),
  );
  await user.click(screen.getByRole("button", { name: "Choose second" }));
  expect(screen.queryByText("Hello")).toBeNull();
  await user.type(screen.getByLabelText("Message"), "Fresh");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[2].messages).toEqual([{ role: "user", content: "Fresh" }]);
});

test("failed sends retain the draft and show shared toast feedback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { message: "Provider rejected the credentials." },
        { status: 502 },
      ),
    ),
  );
  const user = userEvent.setup();
  render(<AiTestChat />);
  await user.click(screen.getByRole("button", { name: "Choose first" }));
  await user.type(screen.getByLabelText("Message"), "Keep this draft");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Provider rejected the credentials.",
    ),
  );
  expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe(
    "Keep this draft",
  );
  expect(screen.queryByText("Keep this draft")).toBeNull();
});

test("pending sends disable model changes and duplicate submission", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<AiTestChat />);
  await user.click(screen.getByRole("button", { name: "Choose first" }));
  await user.type(screen.getByLabelText("Message"), "Hello");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(
    (screen.getByRole("button", { name: "Choose second" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText("Waiting for the model…").getAttribute("role")).toBe(
    "status",
  );
  expect(
    screen.getByRole("button", { name: "Send" }).getAttribute("aria-busy"),
  ).toBe("true");
  expect(fetcher).toHaveBeenCalledTimes(1);
  finish(Response.json({ text: "Done" }));
  expect(await screen.findByText("Done")).toBeTruthy();
});

test("a full conversation gives clear recovery feedback before another provider request", async () => {
  const fetcher = vi.fn(async () => Response.json({ text: "x".repeat(32768) }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<AiTestChat />);
  await user.click(screen.getByRole("button", { name: "Choose first" }));
  await user.type(screen.getByLabelText("Message"), "Hello");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe(
      "",
    ),
  );
  await user.type(screen.getByLabelText("Message"), "Continue");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "This test conversation is too long. Start a new conversation.",
    ),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe(
    "Continue",
  );
});
