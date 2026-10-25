// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReviewNotes } from "../components/review-notes";

vi.mock("@/components/file-icon", () => ({
  FileIcon: ({ fileName }: { fileName: string }) => (
    <span data-testid="file-icon">{fileName}</span>
  ),
}));
afterEach(cleanup);

test("the note body is the full-width navigation target with file metadata below", () => {
  const note = {
    id: "note",
    previewId: "review",
    path: "src/index.ts",
    body: "Investigate this behavior",
    line: { side: "additions" as const, lineNumber: 2, code: "test" },
  };
  const select = vi.fn();
  render(
    <ReviewNotes
      notes={[note]}
      onSelectNote={select}
      onEditNote={vi.fn()}
      onDeleteNote={vi.fn()}
    />,
  );
  const button = screen.getByRole("button", {
    name: /Investigate this behavior/,
  });
  fireEvent.click(button);
  expect(select).toHaveBeenCalledWith(note);
  expect(button.querySelector(".font-mono")).not.toBeNull();
  expect(button.querySelector('[data-testid="file-icon"]')).not.toBeNull();
  expect(screen.getByLabelText("Saved notes").className).not.toMatch(/\bp-3\b/);
});
