// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { createRef } from "react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Toaster, toast } from "@/components/ui/toast";

afterEach(cleanup);

test("tooltips preserve refs, click handlers, keyboard presses, and form submission without nested buttons", async () => {
  const submit = vi.fn((event) => event.preventDefault());
  const click = vi.fn();
  const ref = createRef<HTMLButtonElement>();
  const user = userEvent.setup();
  const view = render(
    <TooltipProvider>
      <form onSubmit={submit}>
        <TooltipWrapper content="Save changes">
          <Button ref={ref} type="submit" onClick={click}>
            Save
          </Button>
        </TooltipWrapper>
      </form>
    </TooltipProvider>,
  );
  const button = screen.getByRole("button", { name: "Save" });
  expect(ref.current).toBe(button);
  expect(view.container.querySelector("button button")).toBeNull();
  await user.tab();
  expect(await screen.findByText("Save changes")).toBeTruthy();
  await user.keyboard("{Enter}");
  expect(click).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledTimes(1);
  await user.keyboard(" ");
  expect(click).toHaveBeenCalledTimes(2);
  expect(submit).toHaveBeenCalledTimes(2);
});

test("links retain link semantics and disabled buttons remain disabled while their hint is accessible", async () => {
  const click = vi.fn();
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <TooltipWrapper content="Visit documentation">
        <a href="#docs">Docs</a>
      </TooltipWrapper>
      <TooltipWrapper content="Nothing to save">
        <Button disabled onClick={click}>
          Disabled
        </Button>
      </TooltipWrapper>
    </TooltipProvider>,
  );
  const link = screen.getByRole("link", { name: "Docs" });
  await user.hover(link);
  expect(await screen.findByText("Visit documentation")).toBeTruthy();
  await user.unhover(link);
  await user.tab();
  await user.tab();
  expect(await screen.findByText("Nothing to save")).toBeTruthy();
  await user.keyboard("{Enter}");
  expect(click).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Disabled" }).hasAttribute("disabled"),
  ).toBe(true);
});

test("composed dialog triggers open once and return focus, with notifications above modal layers", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <Toaster />
      <Dialog>
        <TooltipWrapper content="Open settings">
          <DialogTrigger render={<Button />}>Settings</DialogTrigger>
        </TooltipWrapper>
        <DialogContent>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>Local preferences</DialogDescription>
          <Button onClick={() => toast.error("Visible save error")}>
            Notify
          </Button>
        </DialogContent>
      </Dialog>
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Notify" }));
  const notification = await screen.findByText("Visible save error");
  expect(
    notification
      .closest('[data-slot="toast-viewport"]')
      ?.classList.contains("z-[100]"),
  ).toBe(true);
  expect(notification.closest('[aria-hidden="true"], [inert]')).toBeNull();
  await user.hover(notification);
  await user.click(await screen.findByRole("button", { name: "Close toast" }));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Preferences" })).toBeNull(),
  );
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Settings" }),
  );
});
