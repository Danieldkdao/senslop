// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { projectPolicySchema } from "@senslop/contracts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReviewOptionsPopover } from "../components/review-options-popover";

afterEach(cleanup);

test("review options retain rules, open existing dialogs, and save depth with the current limits", async () => {
  const user = userEvent.setup();
  const onAction = vi.fn(async () => null);
  const onBrief = vi.fn();
  const onRules = vi.fn();
  render(
    <TooltipProvider>
      <ReviewOptionsPopover
        policy={projectPolicySchema.parse({
          tokenBudget: 1200,
          timeLimitSeconds: 30,
        })}
        instructions={{
          profiles: ["security"],
          rules: [
            {
              id: "validate-input",
              text: "Validate every input",
              paths: ["src/**"],
              enabled: true,
              source: ".senslop/review.json",
              scope: "",
              precedence: 1,
            },
          ],
          sources: [],
          limitations: [],
        }}
        onAction={onAction}
        onBrief={onBrief}
        onRules={onRules}
      />
    </TooltipProvider>,
  );
  expect(screen.queryByRole("button", { name: "Review brief" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Review settings" }));
  expect(screen.getByText("Security")).toBeTruthy();
  expect(screen.getByText("Validate every input")).toBeTruthy();
  await user.click(screen.getByRole("combobox", { name: "Analysis depth" }));
  await user.keyboard("{ArrowDown}");
  await user.click(await screen.findByRole("option", { name: "Thorough" }));
  expect(onAction).toHaveBeenCalledWith({
    action: "save-review-limits",
    limits: { mode: "thorough", tokenBudget: 1200, timeLimitSeconds: 30 },
  });
  await user.click(screen.getByRole("button", { name: "Review brief" }));
  expect(onBrief).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Review settings" }));
  await user.click(
    screen.getByRole("button", { name: "Review profiles and rules" }),
  );
  expect(onRules).toHaveBeenCalledOnce();
});
