// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckForm } from "../components/check-form";
afterEach(cleanup);
test("running a check submits the displayed command and timeout", async () => {
  const act = vi.fn().mockResolvedValue({});
  render(
    <CheckForm onAction={act} checks={[]} suggestedCommands={["pnpm test"]} />,
  );
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Command" }),
    "node --version",
  );
  await user.click(screen.getByRole("button", { name: "Run check" }));
  expect(act).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "start-check",
      command: "node --version",
      timeoutSeconds: 600,
    }),
  );
});
