// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { PreviewEventSchema } from "@senslop/contracts";
import { LivePreviewProvider } from "../components/live-preview-provider";

const mocks = vi.hoisted(() => ({
  callbacks: undefined as
    | undefined
    | { onPreview(event: PreviewEventSchema): void; onDisconnect(): void },
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/features/connection/hooks/use-presence", () => ({
  usePresence: (callbacks: typeof mocks.callbacks) => {
    mocks.callbacks = callbacks;
    return { status: "live", devices: [] };
  },
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("feedback follows validated preview state, ignoring stale completion and reporting interrupted streams", () => {
  render(
    <LivePreviewProvider>
      <div />
    </LivePreviewProvider>,
  );
  const previewId = "b7abed53-2d2b-489d-8cd6-fc4721b8d404";
  act(() =>
    mocks.callbacks!.onPreview({
      type: "preview.start",
      previewId,
      fileCount: 1,
      source: {
        kind: "working-tree",
        base: "a".repeat(40),
        head: null,
        firstParent: false,
      },
      excluded: [],
    }),
  );
  act(() =>
    mocks.callbacks!.onPreview({
      type: "preview.complete",
      previewId: "other",
    }),
  );
  expect(mocks.success).not.toHaveBeenCalled();
  act(() =>
    mocks.callbacks!.onPreview({ type: "preview.complete", previewId }),
  );
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(
    "Preview is incomplete. Send it again from the CLI.",
  );
  act(() =>
    mocks.callbacks!.onPreview({ type: "preview.complete", previewId }),
  );
  expect(mocks.error).toHaveBeenCalledTimes(1);
});
