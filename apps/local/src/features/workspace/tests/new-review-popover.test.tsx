// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { NewReviewPopover } from "../components/new-review-popover";
import type { WorkspaceMetadata } from "../types";

afterEach(cleanup);

const metadata: WorkspaceMetadata = {
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
