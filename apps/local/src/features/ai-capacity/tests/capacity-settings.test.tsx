// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiCapacitySettings } from "../components/ai-capacity-settings";
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
    <AiCapacitySettings
      connections={connections}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
};

test("capacity controls show ranges, explain high choices, and enable optional quotas", async () => {
  render(<Harness />);
  const user = userEvent.setup();
  const concurrency = screen.getByRole("spinbutton", {
    name: "Concurrent requests",
  });
  expect(concurrency.getAttribute("min")).toBe("1");
  expect(concurrency.getAttribute("max")).toBe("16");
  await user.clear(concurrency);
  await user.type(concurrency, "8");
  await user.tab();
  expect(screen.getByText(/High concurrency/)).toBeTruthy();
  const quota = screen.getByRole("spinbutton", {
    name: "Requests per minute",
  }) as HTMLInputElement;
  expect(quota.disabled).toBe(true);
  await user.click(
    screen.getByRole("switch", { name: "Limit requests per minute" }),
  );
  expect(quota.disabled).toBe(false);
  expect(screen.getByText(/Minimum 1; maximum 6,000/)).toBeTruthy();
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
