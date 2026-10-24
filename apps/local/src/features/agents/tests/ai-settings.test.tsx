// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { AiSettings } from "../components/ai-settings";
import { defaultAiSettings } from "../constants";
import { formatAgentRole } from "../lib/formatters";

const state = vi.hoisted(() => ({
  settings: {} as typeof defaultAiSettings,
  locked: false,
  save: vi.fn(async () => {}),
}));
beforeEach(() => {
  state.settings = { ...defaultAiSettings };
  state.locked = false;
  state.save.mockClear();
});
vi.mock("../hooks/use-ai-settings", () => ({
  useAiSettings: () => ({
    settings: { data: state.settings },
    capacityStatus: { data: { locked: state.locked } },
    save: state.save,
  }),
}));
vi.mock("../../providers/hooks/use-provider-models", () => ({
  useProviderModels: () => ({
    entries: [
      {
        connection: {
          id: "test",
          name: "Test",
          provider: "lm-studio",
          contextWindow: null,
        },
        catalog: { models: [{ available: true }] },
      },
    ],
  }),
}));
vi.mock("../../providers/components/model-picker", () => ({
  ModelPicker: () => <button type="button">Select a model</button>,
}));
vi.mock("../../settings/components/provider-settings-dialog", () => ({
  getProviderSettingsSection: () => ({ content: null }),
}));
afterEach(cleanup);

test("CLI settings refresh updates clean fields while preserving unsaved grouping instructions", async () => {
  state.settings = {
    ...defaultAiSettings,
    shared: { connectionId: "test", modelId: "test", name: "Test" },
  };
  const navigation = { navigate: vi.fn() } as never;
  const view = render(<AiSettings navigation={navigation} />);
  const user = userEvent.setup();
  const input = screen.getByLabelText("Grouping instructions");
  await user.clear(input);
  await user.type(input, "My draft");
  state.settings = {
    ...state.settings,
    prompt: "CLI instructions",
    separate: true,
  };
  view.rerender(<AiSettings navigation={navigation} />);
  expect(
    (screen.getByLabelText("Grouping instructions") as HTMLTextAreaElement)
      .value,
  ).toBe("My draft");
  expect(
    screen
      .getByRole("switch", { name: "Use a separate model for each task" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

test("model settings explain the shared model and show every role description beside its picker", async () => {
  render(<AiSettings navigation={{ navigate: vi.fn() } as never} />);
  expect(
    screen.getByText(
      "Uses the same model to group changes, gather context, review code, and explain changes.",
    ),
  ).toBeTruthy();
  await userEvent.setup().click(
    screen.getByRole("switch", {
      name: "Use a separate model for each task",
    }),
  );
  for (const role of ["grouping", "context", "review", "explain"] as const) {
    const { label, description } = formatAgentRole(role);
    expect(label).toBeTruthy();
    expect(description).toBeTruthy();
    const row = within(screen.getByRole("group", { name: label }));
    expect(row.getByText(description)).toBeTruthy();
    expect(row.getByRole("button", { name: "Select a model" })).toBeTruthy();
  }
});

test("grouping options describe waiting behavior and save the selected mode", async () => {
  state.settings = {
    ...defaultAiSettings,
    shared: { connectionId: "test", modelId: "test", name: "Test" },
  };
  render(<AiSettings navigation={{ navigate: vi.fn() } as never} />);
  const select = screen.getByRole("combobox", {
    name: "Grouping and summaries",
  });
  expect(select.textContent).toContain("No grouping or summarization");
  const user = userEvent.setup();
  await user.click(select);
  expect(
    await screen.findByRole("option", { name: /No grouping or summarization/ }),
  ).toBeTruthy();
  await user.click(screen.getByRole("option", { name: /Decide each review/ }));
  expect(select.textContent).toContain("Decide each review");
});

test("grouping controls stay disabled until the active grouping model is assigned", () => {
  state.settings = {
    ...defaultAiSettings,
    separate: true,
    shared: { connectionId: "unused", modelId: "unused", name: "Unused" },
  };
  render(<AiSettings navigation={{ navigate: vi.fn() } as never} />);
  expect(
    screen
      .getByRole("combobox", { name: "Grouping and summaries" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByLabelText("Grouping instructions").hasAttribute("disabled"),
  ).toBe(true);
});
