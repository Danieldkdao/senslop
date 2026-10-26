// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { BuddySprite } from "../components/buddy-sprite";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("the buddy waits for a complete drawn frame instead of displaying the raw atlas", () => {
  const images: { onload: null | (() => void); src: string }[] = [];
  vi.stubGlobal(
    "Image",
    class {
      onload = null;
      src = "";
      constructor() {
        images.push(this);
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    putImageData: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
  } as unknown as CanvasRenderingContext2D);
  const { container } = render(<BuddySprite mood="idle" still />);
  const canvas = container.querySelector("canvas")!;
  expect(container.querySelector(".pip-sprite-fallback")).toBeNull();
  expect(canvas.classList.contains("invisible")).toBe(true);
  act(() => images[0]!.onload?.());
  expect(canvas.classList.contains("invisible")).toBe(false);
});
