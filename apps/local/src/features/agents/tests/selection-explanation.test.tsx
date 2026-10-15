// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { SelectionExplanation } from "../components/selection-explanation";
const models = vi.hoisted(() => ({ configured: true }));
vi.mock("../hooks/use-ai-settings", () => ({
  useAiSettings: () => ({
    settings: {
      data: { shared: models.configured ? {} : null, separate: false },
    },
  }),
}));
afterEach(() => {
  models.configured = true;
  cleanup();
  vi.unstubAllGlobals();
});
test("explanations use SDK completion streaming, preserve partial errors, and retry exact source coordinates", async () => {
  const response = (fail: boolean) =>
    createUIMessageStreamResponse({
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "text" });
          controller.enqueue({
            type: "text-delta",
            id: "text",
            delta: fail ? "Partial explanation" : "Complete explanation",
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
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce(response(false));
  vi.stubGlobal("fetch", fetcher);
  render(
    <SelectionExplanation
      snapshotId="snapshot"
      file={
        {
          path: "a.ts",
          before: "old\nsecond\nthird",
          after: "new",
          binary: false,
        } as never
      }
      range={{ start: 3, end: 1, side: "deletions" }}
      anchor={document.body}
      onDismiss={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Explain" }));
  await screen.findByText("Partial explanation");
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Retry explanation" }));
  await screen.findByText("Complete explanation");
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({
    snapshotId: "snapshot",
    path: "a.ts",
    side: "before",
    start: 1,
    end: 3,
  });
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

test("switching source files stops the previous explanation request", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
    signal = options.signal ?? undefined;
    return Promise.resolve(
      createUIMessageStreamResponse({
        stream: new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "In progress",
            });
            signal?.addEventListener(
              "abort",
              () => controller.error(new DOMException("Stopped", "AbortError")),
              { once: true },
            );
          },
        }),
      }),
    );
  });
  const props = {
    snapshotId: "switching",
    file: {
      path: "first.ts",
      before: "old",
      after: "new",
      binary: false,
    } as never,
    range: { start: 1, end: 1, side: "additions" as const },
    anchor: document.body,
    onDismiss: vi.fn(),
  };
  const { rerender } = render(<SelectionExplanation {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Explain" }));
  await screen.findByText("In progress");
  rerender(
    <SelectionExplanation
      {...props}
      file={
        {
          path: "second.ts",
          before: "old",
          after: "new",
          binary: false,
        } as never
      }
    />,
  );
  await waitFor(() => expect(signal?.aborted).toBe(true));
});

test("Explain stays disabled when its model is unconfigured", async () => {
  models.configured = false;
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <SelectionExplanation
      snapshotId="disabled"
      file={{ path: "a.ts" } as never}
      range={{ start: 1, end: 1 }}
      anchor={document.body}
      onDismiss={vi.fn()}
    />,
  );
  const button = screen.getByRole("button", { name: "Explain" });
  expect(button.hasAttribute("disabled")).toBe(true);
  await userEvent.setup().click(button);
  expect(fetcher).not.toHaveBeenCalled();
});
