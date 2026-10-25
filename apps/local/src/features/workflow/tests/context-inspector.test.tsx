// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextInspector } from "../components/context-inspector";

vi.mock("../hooks/use-review-context", () => ({
  useReviewContext: () => ({
    data: {
      files: [],
      routes: [],
      selected: [],
      source: null,
      limitations: [
        "lumi-poses.png: context unavailable or exceeds the file limit.",
        "lumi-poses.png: context unavailable or exceeds the file limit.",
        "Supporting source was excluded.",
      ],
    },
  }),
}));

afterEach(cleanup);

test("repeated context limitations render once without duplicate React keys", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ContextInspector review={{ id: "review", hash: "hash", round: 1 }} />,
  );
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Captured context and model routing",
    }),
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
});
