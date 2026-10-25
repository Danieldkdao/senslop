// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  languageSettingsSchema,
  projectPolicySchema,
  type ReviewRulesPatchSchema,
} from "@senslop/contracts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SourceSettings } from "../../workflow/components/source-settings";
import { LanguageSupportSettings } from "../../precision/components/language-support-settings";
import { RulesProfiles } from "../../precision/components/rules-profiles";
import { UsagePopover } from "../../workflow/components/usage-popover";

const state = vi.hoisted(() => ({
  project: vi.fn(async () => {}),
  language: vi.fn(async () => {}),
  rules: vi.fn(async () => {}),
  projectOverrides: {} as ReviewRulesPatchSchema,
  reviewOverrides: {} as ReviewRulesPatchSchema,
}));
vi.mock("../../workflow/hooks/use-project-settings", () => ({
  useProjectSettings: () => ({
    state: {
      data: { policy: projectPolicySchema.parse({}) },
      isPending: false,
    },
    save: state.project,
  }),
}));
vi.mock("../../precision/hooks/use-source-explorer", () => ({
  useSourceExplorer: () => ({
    data: { languageSettings: languageSettingsSchema.parse({}) },
    isPending: false,
  }),
  useLanguageSettings: () => ({ mutateAsync: state.language }),
}));
vi.mock("../../precision/hooks/use-review-intent", () => ({
  useReviewIntent: () => ({
    state: {
      data: {
        projectOverrides: state.projectOverrides,
        reviewOverrides: state.reviewOverrides,
        projectDefaults: ["correctness"],
        reviewDefaults: ["correctness"],
        instructions: {
          profiles: ["correctness"],
          rules: [],
          sources: [],
          limitations: [],
        },
      },
      isPending: false,
    },
    act: state.rules,
  }),
}));
const review = { id: crypto.randomUUID(), hash: "hash", round: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  state.projectOverrides = {};
  state.reviewOverrides = {};
});
afterEach(cleanup);

test("source policy changes save automatically without writing untouched defaults", async () => {
  render(
    <TooltipProvider>
      <SourceSettings />
    </TooltipProvider>,
  );
  expect(state.project).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Save policy" })).toBeNull();
  await userEvent
    .setup()
    .type(screen.getByLabelText("Excluded paths"), "generated/**");
  await waitFor(() =>
    expect(state.project).toHaveBeenLastCalledWith(
      expect.objectContaining({ exclude: ["generated/**"] }),
    ),
  );
});

test("language settings save valid changes without a submit action", async () => {
  render(<LanguageSupportSettings review={review} />);
  const user = userEvent.setup();
  const executable = screen.getAllByLabelText("Executable")[0]!;
  await user.clear(executable);
  await user.type(executable, "custom-pyright");
  await waitFor(() =>
    expect(state.language).toHaveBeenLastCalledWith(
      expect.objectContaining({
        python: expect.objectContaining({ command: "custom-pyright" }),
      }),
    ),
  );
  expect(
    screen.queryByRole("button", { name: "Save language settings" }),
  ).toBeNull();
});

test("switching rule scopes flushes the pending edit to its original scope", async () => {
  render(
    <TooltipProvider>
      <RulesProfiles review={review} />
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "Security" }));
  await user.click(screen.getByRole("combobox", { name: "Rules scope" }));
  await user.keyboard("{ArrowDown}");
  await user.click(
    await screen.findByRole("option", { name: "This review only" }),
  );
  await waitFor(() =>
    expect(state.rules).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "save-rules",
        scope: "project",
        rules: expect.objectContaining({
          profiles: ["correctness", "security"],
        }),
      }),
    ),
  );
  await user.click(screen.getByRole("checkbox", { name: "Performance" }));
  await waitFor(() =>
    expect(state.rules).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: "review",
        rules: expect.objectContaining({
          profiles: ["correctness", "performance"],
        }),
      }),
    ),
  );
  expect(screen.queryByRole("button", { name: "Save overrides" })).toBeNull();
});

test("review budget fields save automatically and preserve the chosen depth", async () => {
  const onAction = vi.fn(async () => {});
  render(
    <TooltipProvider>
      <UsagePopover
        usage={[]}
        policy={projectPolicySchema.parse({ mode: "thorough" })}
        onAction={onAction}
      />
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Usage and budgets" }));
  await user.type(screen.getByLabelText("Token allowance"), "1200");
  await waitFor(() =>
    expect(onAction).toHaveBeenLastCalledWith({
      action: "save-review-limits",
      limits: { mode: "thorough", tokenBudget: 1200, timeLimitSeconds: null },
    }),
  );
  expect(screen.queryByRole("button", { name: "Save limits" })).toBeNull();
});

test.each(["project", "review"] as const)(
  "editing a %s rule keeps inherited dimensions out of the saved override",
  async (scope) => {
    render(
      <TooltipProvider>
        <RulesProfiles review={review} />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    if (scope === "review") {
      await user.click(screen.getByRole("combobox", { name: "Rules scope" }));
      await user.click(
        await screen.findByRole("option", { name: "This review only" }),
      );
    }
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.type(
      screen.getByLabelText("Instruction"),
      "Check authorization",
    );
    await waitFor(() =>
      expect(state.rules).toHaveBeenLastCalledWith({
        action: "save-rules",
        scope,
        rules: {
          rules: [expect.objectContaining({ text: "Check authorization" })],
        },
      }),
    );
  },
);

test("rule edits preserve dimensions already explicitly overridden", async () => {
  state.projectOverrides = { profiles: ["security"] };
  render(
    <TooltipProvider>
      <RulesProfiles review={review} />
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add rule" }));
  await user.type(screen.getByLabelText("Instruction"), "Check authorization");
  await waitFor(() =>
    expect(state.rules).toHaveBeenLastCalledWith({
      action: "save-rules",
      scope: "project",
      rules: {
        profiles: ["security"],
        rules: [expect.objectContaining({ text: "Check authorization" })],
      },
    }),
  );
});
