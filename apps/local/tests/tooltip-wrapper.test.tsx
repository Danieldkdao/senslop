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
import { Popover, PopoverTrigger } from "@/components/ui/popover";
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

test("header button tooltips appear on mouse hover for enabled and disabled actions", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <header>
        <TooltipWrapper content="Previous file">
          <Button disabled aria-label="Previous file" size="icon">
            ←
          </Button>
        </TooltipWrapper>
        <TooltipWrapper content="Next file">
          <Button aria-label="Next file" size="icon">
            →
          </Button>
        </TooltipWrapper>
        <TooltipWrapper content="Find a file">
          <Button aria-label="Find a file" size="icon">
            Search
          </Button>
        </TooltipWrapper>
        <Popover>
          <TooltipWrapper content="Add note">
            <PopoverTrigger
              render={<Button aria-label="Add note" size="icon" />}
            >
              Note
            </PopoverTrigger>
          </TooltipWrapper>
        </Popover>
      </header>
    </TooltipProvider>,
  );
  for (const label of [
    "Next file",
    "Find a file",
    "Previous file",
    "Add note",
  ]) {
    const button = screen.getByRole("button", { name: label });
    const trigger = button.hasAttribute("disabled")
      ? button.parentElement!
      : button;
    await user.hover(trigger);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="tooltip-content"]')?.textContent,
        label,
      ).toBe(label),
    );
    await user.unhover(trigger);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="tooltip-content"]'),
      ).toBeNull(),
    );
  }
});

test("hover hints survive a header button being replaced during a rerender", async () => {
  const user = userEvent.setup();
  const view = (key: string) => (
    <TooltipProvider>
      <TooltipWrapper content="Next file">
        <Button key={key} aria-label="Next file" size="icon">
          Next
        </Button>
      </TooltipWrapper>
    </TooltipProvider>
  );
  const mounted = render(view("first"));
  const original = screen.getByRole("button", { name: "Next file" });
  mounted.rerender(view("replacement"));
  const replacement = screen.getByRole("button", { name: "Next file" });
  expect(replacement).not.toBe(original);
  await user.hover(replacement);
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="tooltip-content"]')?.textContent,
    ).toBe("Next file"),
  );
});

test("header hover hints work after preparation enables a previously disabled button", async () => {
  const user = userEvent.setup();
  const view = (disabled: boolean) => (
    <TooltipProvider>
      <TooltipWrapper content="Next file">
        <Button disabled={disabled} aria-label="Next file" size="icon">
          Next
        </Button>
      </TooltipWrapper>
    </TooltipProvider>
  );
  const mounted = render(view(true));
  mounted.rerender(view(false));
  await user.hover(screen.getByRole("button", { name: "Next file" }));
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="tooltip-content"]')?.textContent,
    ).toBe("Next file"),
  );
});
