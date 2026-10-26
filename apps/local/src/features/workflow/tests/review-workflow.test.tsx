// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useReviewWorkflow } from "../hooks/use-review-workflow";

const feedback = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const review = { id: "review", hash: "hash", round: 1 };

test.each([false, true])(
  "task application reports progress and the actual completion outcome, warning %s",
  async (warning) => {
    const client = new QueryClient();
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const { result } = renderHook(() => useReviewWorkflow(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    try {
      const request = result.current.act(
        { action: "apply-task", taskId: "task", paths: ["app.ts"] },
        review,
      );
      expect(feedback.info).toHaveBeenCalledWith("Applying selected files…");
      expect(feedback.success).not.toHaveBeenCalled();
      finish(
        Response.json(
          warning
            ? { warning: "Files applied; re-sync needs retrying." }
            : { saved: true },
        ),
      );
      await request;
      if (warning) {
        expect(feedback.warning).toHaveBeenCalledWith(
          "Files applied; re-sync needs retrying.",
        );
        expect(feedback.success).not.toHaveBeenCalled();
      } else
        expect(feedback.success).toHaveBeenCalledWith(
          "Selected files applied.",
        );
    } finally {
      client.clear();
    }
  },
);

test("a rejected application shows the error without claiming success", async () => {
  const client = new QueryClient();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { message: "Source changed; inspect the conflict." },
        { status: 409 },
      ),
    ),
  );
  const { result } = renderHook(() => useReviewWorkflow(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  try {
    await expect(
      result.current.act(
        { action: "apply-task", taskId: "task", paths: ["app.ts"] },
        review,
      ),
    ).rejects.toThrow("Source changed");
    expect(feedback.error).toHaveBeenCalledWith(
      "Source changed; inspect the conflict.",
    );
    expect(feedback.success).not.toHaveBeenCalled();
  } finally {
    client.clear();
  }
});
