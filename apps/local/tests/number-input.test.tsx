// @vitest-environment jsdom

import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "@senslop/ui/components/number-input";

afterEach(cleanup);

test("typing and stepping respect bounds while allowing a temporary empty draft", async () => {
  const changed = vi.fn();
  const Harness = () => {
    const [value, setValue] = useState(16);
    return (
      <NumberInput
        label="Font size"
        value={value}
        min={12}
        max={32}
        unit="px"
        onValueChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  };
  render(<Harness />);
  const user = userEvent.setup();
  const input = screen.getByRole("spinbutton", {
    name: "Font size",
  }) as HTMLInputElement;
  await user.clear(input);
  expect(changed).not.toHaveBeenCalled();
  await user.type(input, "32");
  expect(changed).toHaveBeenLastCalledWith(32);
  await user.tab();
  expect(
    (
      screen.getByRole("button", {
        name: "Increase Font size",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Decrease Font size" }));
  expect(input.value).toBe("31");
  await user.clear(input);
  await user.type(input, "9");
  await user.tab();
  expect(input.value).toBe("12");
  expect(
    (
      screen.getByRole("button", {
        name: "Decrease Font size",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.clear(input);
  await user.tab();
  expect(input.value).toBe("12");
  await user.clear(input);
  await user.type(input, "99");
  await user.keyboard("{Enter}");
  expect(input.value).toBe("32");
  expect(
    changed.mock.calls.every(
      ([value]) => Number.isInteger(value) && value >= 12 && value <= 32,
    ),
  ).toBe(true);
  expect(screen.getByText("px")).toBeTruthy();
});
