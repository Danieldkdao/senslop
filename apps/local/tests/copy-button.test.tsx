// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CopyButton } from "../src/components/copy-button";
const feedback = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
});

test("clipboard failures report an error without claiming that copying succeeded", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
  });
  render(<CopyButton text="Answer" />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy response" }));
  });
  expect(screen.queryByRole("button", { name: "Copied response" })).toBeNull();
  expect(feedback.error).toHaveBeenCalledWith(
    "Could not copy. Allow clipboard access and retry.",
  );
});

test("copy feedback shows a check for two seconds then returns to copy", async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<CopyButton text="Final answer" />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy response" }));
  });
  expect(writeText).toHaveBeenCalledWith("Final answer");
  expect(screen.getByRole("button", { name: "Copied response" })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByRole("button", { name: "Copied response" })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("button", { name: "Copy response" })).toBeTruthy();
});
