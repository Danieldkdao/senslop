// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { useConfirm } from "@/hooks/use-confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

afterEach(cleanup);

const Confirmation = () => {
  const { confirm, ConfirmationDialog } = useConfirm(
    "Delete connection?",
    "This removes the saved connection.",
  );
  return (
    <>
      <button type="button" onClick={() => void confirm()}>
        Delete connection
      </button>
      {ConfirmationDialog}
    </>
  );
};

const ParentDialog = ({ children }: { children: ReactNode }) => (
  <Dialog defaultOpen>
    <DialogContent>
      <DialogTitle>Settings</DialogTitle>
      <DialogDescription>Configure the application.</DialogDescription>
      {children}
    </DialogContent>
  </Dialog>
);

test.each([0, 1, 2])(
  "confirmation adds one normal-strength backdrop above %i existing dialogs",
  async (depth) => {
    let view: ReactNode = <Confirmation />;
    for (let index = 0; index < depth; index++)
      view = <ParentDialog>{view}</ParentDialog>;
    render(view);
    const overlays = () =>
      Array.from(document.querySelectorAll('[data-slot="dialog-overlay"]'));
    const parents = Array.from(
      document.querySelectorAll('[data-slot="dialog-content"]'),
    );
    const previousOverlays = overlays();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete connection" }));
    const confirmation = screen.getByRole("dialog", {
      name: "Delete connection?",
    });
    expect(overlays()).toHaveLength(previousOverlays.length + 1);
    const backdrop = overlays().at(-1)!;
    for (const parent of parents)
      expect(
        parent.compareDocumentPosition(backdrop) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(
      backdrop.compareDocumentPosition(confirmation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    if (previousOverlays.length)
      expect(backdrop.className).toBe(previousOverlays[0].className);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(overlays()).toHaveLength(previousOverlays.length),
    );
    expect(
      document.querySelectorAll('[data-slot="dialog-content"]'),
    ).toHaveLength(depth);
  },
);
