// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { NewReviewPopover } from "../components/new-review-popover";
import type { WorkspaceMetadata } from "../types";

const ai = vi.hoisted(() => ({ mode: "always", configured: true }));
vi.mock("../../agents/hooks/use-ai-settings", () => ({
  useAiSettings: () => ({
    settings: {
      data: {
        groupingMode: ai.mode,
        separate: false,
        shared: ai.configured ? { modelId: "test" } : null,
      },
    },
  }),
}));
afterEach(() => {
  cleanup();
  ai.mode = "always";
  ai.configured = true;
});

const metadata: WorkspaceMetadata = {
  directory: "/opened/repo",
  root: "/opened/repo",
  repository: {
    root: "/opened/repo",
    branch: "feature",
    head: "a".repeat(40),
    fingerprint: "b".repeat(64),
    commits: [],
    branches: ["feature", "main"],
  },
  history: [],
};

test("the extracted form validates range endpoints, retains a failed selection, and closes only after success", async () => {
  const inspect = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const user = userEvent.setup();
  render(
    <NewReviewPopover
      metadata={metadata}
      preview={null}
      loading={false}
      busy={false}
      error={null}
      onInspect={inspect}
    />,
  );
  await user.click(screen.getByRole("button", { name: "New review" }));
  expect(screen.getByText("/opened/repo")).toBeTruthy();
  await user.click(screen.getByLabelText("Changes to inspect"));
  await user.click(await screen.findByRole("option", { name: "Commit range" }));
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Choose a revision.",
  );
  expect(inspect).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Ancestor commit"), "HEAD~1");
  await user.tab();
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  await waitFor(() =>
    expect(inspect).toHaveBeenCalledWith({
      kind: "range",
      base: "HEAD~1",
      head: "HEAD",
    }),
  );
  expect(
    (screen.getByLabelText("Ancestor commit") as HTMLInputElement).value,
  ).toBe("HEAD~1");
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Inspect changes" }),
    ).toBeNull(),
  );
  await user.click(screen.getByRole("button", { name: "New review" }));
  expect(
    (screen.getByLabelText("Ancestor commit") as HTMLInputElement).value,
  ).toBe("HEAD~1");
});

test("repository loading disables inspection and displays the appropriate state", async () => {
  const user = userEvent.setup();
  render(
    <NewReviewPopover
      metadata={null}
      preview={null}
      loading
      busy={false}
      error={null}
      onInspect={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "New review" }));
  expect(screen.getByText("Loading repository…")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Inspect changes" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

test("revision combobox searches commit subjects, selects IDs, and accepts custom Git revisions", async () => {
  const inspect = vi.fn().mockResolvedValue(false);
  const user = userEvent.setup();
  render(
    <NewReviewPopover
      metadata={{
        ...metadata,
        repository: {
          ...metadata.repository!,
          commits: [
            {
              id: "c".repeat(40),
              subject: "Fix model discovery",
              date: "2026-10-10T00:00:00Z",
            },
          ],
        },
      }}
      preview={null}
      loading={false}
      busy={false}
      error={null}
      onInspect={inspect}
    />,
  );
  await user.click(screen.getByRole("button", { name: "New review" }));
  await user.click(screen.getByLabelText("Changes to inspect"));
  await user.click(
    await screen.findByRole("option", { name: "Single commit" }),
  );
  const input = screen.getByRole("combobox", {
    name: "Commit: latest is HEAD",
  });
  await user.clear(input);
  await user.type(input, "model discovery");
  await user.click(
    await screen.findByRole("option", { name: /Fix model discovery/ }),
  );
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  await waitFor(() =>
    expect(inspect).toHaveBeenLastCalledWith({
      kind: "commit",
      commit: "c".repeat(40),
    }),
  );
  await user.clear(input);
  await user.type(input, "HEAD~2");
  await user.tab();
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  await waitFor(() =>
    expect(inspect).toHaveBeenLastCalledWith({
      kind: "commit",
      commit: "HEAD~2",
    }),
  );
});

test("only decide-each-review shows a toggle and sends the choice with inspection", async () => {
  ai.mode = "ask";
  const inspect = vi.fn().mockResolvedValue(true);
  const props = {
    metadata,
    preview: null,
    loading: false,
    busy: false,
    error: null,
    onInspect: inspect,
  };
  const { rerender } = render(<NewReviewPopover {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New review" }));
  await user.click(
    screen.getByRole("switch", { name: "Group and summarize this review" }),
  );
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  expect(inspect).toHaveBeenCalledWith({ kind: "working-tree" }, false);
  ai.mode = "never";
  rerender(<NewReviewPopover {...props} />);
  await user.click(screen.getByRole("button", { name: "New review" }));
  expect(screen.queryByRole("switch")).toBeNull();
});

test("the per-review grouping switch is disabled without a grouping model", async () => {
  ai.mode = "ask";
  ai.configured = false;
  render(
    <NewReviewPopover
      metadata={metadata}
      preview={null}
      loading={false}
      busy={false}
      error={null}
      onInspect={vi.fn()}
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "New review" }));
  const toggle = screen.getByRole("switch", {
    name: "Group and summarize this review",
  });
  expect(toggle.getAttribute("aria-disabled")).toBe("true");
  expect(toggle.getAttribute("aria-checked")).toBe("false");
});

test("inspection loading keeps the button label and uses the shared loading swap", async () => {
  render(
    <NewReviewPopover
      metadata={metadata}
      preview={null}
      loading={false}
      busy
      error={null}
      onInspect={vi.fn()}
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "New review" }));
  const button = screen.getByRole("button", { name: "Inspect changes" });
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(
    button.querySelector('[role="status"][aria-hidden="false"]'),
  ).toBeTruthy();
  expect(button.textContent).toBe("Inspect changes");
});
