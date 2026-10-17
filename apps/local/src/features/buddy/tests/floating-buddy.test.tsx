// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BuddyProvider, useBuddy } from "../components/buddy-provider";
import { defaultUiPreferences } from "../../settings/constants";

const saved = vi.hoisted(() => ({
  visible: true,
  animations: true,
  size: 96,
  save: vi.fn(),
}));
vi.mock("../../settings/hooks/use-ui-preferences", () => ({
  useUiPreferences: () => ({
    values: {
      ...defaultUiPreferences,
      buddy: {
        visible: saved.visible,
        animations: saved.animations,
        size: saved.size,
        position: null,
      },
    },
    preferences: { isSuccess: true, data: defaultUiPreferences },
    save: saved.save,
  }),
}));
const Actions = () => {
  const report = useBuddy();
  return (
    <button
      onClick={() =>
        report({
          type: "reaction",
          id: "chat-1",
          mood: "happy",
          message: "Response ready.",
        })
      }
    >
      Finish chat
    </button>
  );
};
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  saved.visible = true;
  saved.animations = true;
  saved.size = defaultUiPreferences.buddy.size;
  saved.save.mockReset();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

test("resizing updates the canvas and placement using the new full dimensions", () => {
  const { rerender } = render(
    <BuddyProvider>
      <Actions />
    </BuddyProvider>,
  );
  saved.size = 120;
  rerender(
    <BuddyProvider>
      <Actions />
    </BuddyProvider>,
  );
  const buddy = screen.getByRole("button", { name: /move pip/i });
  expect(buddy.querySelector("canvas")?.width).toBe(120);
  fireEvent.keyDown(buddy, { key: "ArrowLeft" });
  expect(saved.save).toHaveBeenLastCalledWith({
    buddy: {
      position: {
        x: (window.innerWidth - 120 - 36) / (window.innerWidth - 120 - 24),
        y: 1,
      },
    },
  });
});

test("modern media change listeners update reduced motion and are cleaned up", () => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  vi.mocked(window.matchMedia).mockReturnValue(media);
  const { unmount } = render(
    <BuddyProvider>
      <Actions />
    </BuddyProvider>,
  );
  const listener = vi.mocked(media.addEventListener).mock
    .calls[0][1] as () => void;
  expect(media.addEventListener).toHaveBeenCalledWith("change", listener);
  Object.assign(media, { matches: true });
  act(() => listener());
  expect(
    screen
      .getByRole("button", { name: /move pip/i })
      .querySelector(".pip-motion")
      ?.getAttribute("data-still"),
  ).toBe("true");
  unmount();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("only the compact buddy intercepts input and keyboard placement cannot trigger workspace navigation", () => {
  render(
    <BuddyProvider>
      <Actions />
    </BuddyProvider>,
  );
  const buddy = screen.getByRole("button", { name: /move pip/i });
  const layer = screen.getByTestId("buddy-layer");
  expect(layer.style.pointerEvents).toBe("none");
  expect(buddy.style.pointerEvents).toBe("auto");
  const bubbling = vi.fn();
  document.addEventListener("keydown", bubbling);
  fireEvent.keyDown(buddy, { key: "ArrowLeft" });
  expect(saved.save).toHaveBeenCalledWith({
    buddy: {
      position: expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    },
  });
  expect(bubbling).not.toHaveBeenCalled();
  document.removeEventListener("keydown", bubbling);
  fireEvent.click(screen.getByText("Finish chat"));
  expect(screen.getByRole("status").textContent).toContain("Response ready.");
});

test("hiding unmounts Pip and showing again does not replay hidden celebrations", () => {
  const { rerender } = render(
    <BuddyProvider>
      <Actions />
    </BuddyProvider>,
  );
  saved.visible = false;
  rerender(
    <BuddyProvider>
      <Actions />
    </BuddyProvider>,
  );
  expect(screen.queryByRole("button", { name: /move pip/i })).toBeNull();
  fireEvent.click(screen.getByText("Finish chat"));
  saved.visible = true;
  rerender(
    <BuddyProvider>
      <Actions />
    </BuddyProvider>,
  );
  expect(screen.getByRole("button", { name: /move pip/i })).toBeTruthy();
  expect(screen.getByRole("status").textContent).not.toContain(
    "Response ready.",
  );
});

test("reactions settle and reset leaves ongoing work intact", async () => {
  vi.useFakeTimers();
  try {
    render(
      <BuddyProvider>
        <Actions />
      </BuddyProvider>,
    );
    fireEvent.click(screen.getByText("Finish chat"));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status").textContent).toContain("Pip is here");
  } finally {
    vi.useRealTimers();
  }
});
