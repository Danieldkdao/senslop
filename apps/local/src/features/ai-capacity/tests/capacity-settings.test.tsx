// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiCapacitySettings } from "../components/ai-capacity-settings";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AiCapacitySchema } from "../schemas";

afterEach(cleanup);
const connections = [
  {
    id: "local",
    name: "My local server",
    provider: "lm-studio" as const,
    contextWindow: null,
  },
];
const Harness = ({ disabled = false }: { disabled?: boolean }) => {
  const [value, onChange] = useState<AiCapacitySchema>({});
  return (
    <TooltipProvider>
      <AiCapacitySettings
        connections={connections}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </TooltipProvider>
  );
};

test("capacity controls keep validation bounds and show descriptions and choice feedback in help tooltips", async () => {
  render(<Harness />);
  const user = userEvent.setup();
  const concurrency = screen.getByRole("spinbutton", {
    name: "Concurrent requests",
  });
  expect(concurrency.getAttribute("min")).toBe("1");
  expect(concurrency.getAttribute("max")).toBe("16");
  expect(screen.queryAllByText(/Minimum .*maximum/)).toHaveLength(0);
  expect(screen.queryAllByText(/; optional/)).toHaveLength(0);
  const help = screen.getByRole("button", {
    name: "About concurrent requests",
  });
  await user.hover(help);
  expect(
    (await screen.findByText(/Requests allowed at once/)).closest(
      '[data-slot="tooltip-content"]',
    ),
  ).toBeTruthy();
  await user.unhover(help);
  await waitFor(() =>
    expect(screen.queryByText(/Requests allowed at once/)).toBeNull(),
  );
  await user.clear(concurrency);
  await user.type(concurrency, "8");
  await user.tab();
  expect(screen.queryByText(/High concurrency/)).toBeNull();
  await user.hover(help);
  expect(
    (await screen.findByText(/High concurrency/)).closest(
      '[data-slot="tooltip-content"]',
    ),
  ).toBeTruthy();
  await user.unhover(help);
  const quota = screen.getByRole("spinbutton", {
    name: "Requests per minute",
  }) as HTMLInputElement;
  expect(quota.disabled).toBe(true);
  await user.click(
    screen.getByRole("switch", { name: "Limit requests per minute" }),
  );
  expect(quota.disabled).toBe(false);
  expect(screen.queryByText(/Minimum 1; maximum 6,000/)).toBeNull();
});

test("capacity help is accessible with the keyboard", async () => {
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Higher throughput" }));
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "About concurrent requests" }),
  );
  expect(await screen.findByText(/Requests allowed at once/)).toBeTruthy();
});

test("capacity sharing and subscription guidance use one compact sentence", () => {
  render(<Harness />);
  expect(screen.getByText(/^Budgets cover all models/).textContent).toBe(
    "Budgets cover all models on a connection, so use separate connections for different limits; matching local endpoints share capacity, outside requests are untracked, and subscription limits count Senslop calls with estimated token usage.",
  );
  expect(
    screen.queryByText(/Applies to all models on this connection/),
  ).toBeNull();
});

test("all capacity editing is disabled during analysis and explains how to unlock", () => {
  render(<Harness disabled />);
  const section = within(screen.getByRole("group", { name: "AI capacity" }));
  for (const input of section.getAllByRole("spinbutton"))
    expect((input as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(/disabled while grouping or review/)).toBeTruthy();
});

test("a preset updates the controls and keeps the configured context budget", async () => {
  render(<Harness />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Higher throughput" }));
  expect(
    (
      screen.getByRole("spinbutton", {
        name: "Concurrent requests",
      }) as HTMLInputElement
    ).value,
  ).toBe("2");
  expect(
    (
      screen.getByRole("spinbutton", {
        name: "Context budget",
      }) as HTMLInputElement
    ).value,
  ).toBe("16384");
});
