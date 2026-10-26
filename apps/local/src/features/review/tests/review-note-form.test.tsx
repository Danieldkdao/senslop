// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewNoteForm } from "../components/review-note-form";

afterEach(cleanup);
test("failed note persistence retains the draft and a retry clears it only after successful save", async () => {
  const onSubmit = vi
    .fn()
    .mockRejectedValueOnce(new Error("Disk is read-only. Retry."))
    .mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<ReviewNoteForm onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText("Note"), "Keep my draft");
  await user.click(screen.getByRole("button", { name: "Add note" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Disk is read-only"),
  );
  expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe(
    "Keep my draft",
  );
  await user.click(screen.getByRole("button", { name: "Add note" }));
  await waitFor(() =>
    expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe(
      "",
    ),
  );
});
test.each([false, true])(
  "Enter submits notes/comments, Shift+Enter adds a line, IME Enter stays composing (%s)",
  async (isComment) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReviewNoteForm onSubmit={onSubmit} isComment={isComment} />);
    const input = screen.getByLabelText(isComment ? "Comment" : "Note");
    await user.type(input, "first{Shift>}{Enter}{/Shift}second");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ body: "first\nsecond" }),
    );
  },
);

test("a closed note restores its persisted text when the editor is mounted again", async () => {
  localStorage.clear();
  sessionStorage.clear();
  const user = userEvent.setup();
  const props = { onSubmit: vi.fn(), draftKey: "note:production-restore" };
  const first = render(<ReviewNoteForm {...props} />);
  await user.type(screen.getByLabelText("Note"), "Persist this note");
  first.unmount();
  render(<ReviewNoteForm {...props} />);
  expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe(
    "Persist this note",
  );
});
