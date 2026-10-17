// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { PreviewFileSchema } from "@senslop/contracts";
import type { LivePreview } from "../../review/types";
import type { JobSchema } from "../schemas";
import { ReviewResults } from "../components/review-results";

vi.mock("../components/agent-markdown", () => ({
  AgentMarkdown: ({ children }: { children: string }) => <p>{children}</p>,
}));
const evidenceState = vi.hoisted(() => ({
  file: undefined as PreviewFileSchema | undefined,
}));
vi.mock("../components/finding-evidence", () => ({
  FindingEvidence: ({
    finding,
    onEvidence,
    file,
  }: {
    finding: import("../schemas").FindingSchema;
    file?: PreviewFileSchema;
    onEvidence?: (finding: unknown) => void;
  }) => {
    evidenceState.file = file;
    return (
      <div>
        <button onClick={() => onEvidence?.(finding)}>{finding.path}</button>
        <pre>{finding.code}</pre>
      </div>
    );
  },
}));
vi.mock("@senslop/ui/hooks/use-highlighted-code", () => ({
  useHighlightedCode: (value: string) => value.split("\n"),
}));
afterEach(cleanup);
const finding = {
  severity: "high" as const,
  title: "Missing guard",
  problem: "An empty input causes a crash.",
  path: "a.ts",
  side: "after" as const,
  start: 2,
  end: 2,
  code: "input.value",
  fixPrompt: "Guard the input.",
};
const job = {
  snapshotId: "snapshot",
  result: {
    findings: [finding, { ...finding, title: "Other issue", path: "b.ts" }],
    limitations: ["Compiler diagnostics were unavailable."],
    fixAllPrompt: "Verify fixes.",
  },
} as JobSchema;

test("findings expand independently and keep evidence actions out of the title trigger", async () => {
  const evidence = vi.fn();
  render(<ReviewResults job={job} onEvidence={evidence} />);
  const user = userEvent.setup();
  const first = screen.getByRole("button", { name: "Missing guard" });
  const second = screen.getByRole("button", { name: "Other issue" });
  expect(first.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText(finding.problem)).toBeNull();
  await user.click(first);
  expect(first.getAttribute("aria-expanded")).toBe("true");
  expect(second.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByText(finding.problem)).toBeTruthy();
  expect(
    screen
      .getByText(finding.problem)
      .closest('[data-slot="collapsible-content"]')
      ?.querySelectorAll("p"),
  ).toHaveLength(1);
  expect(screen.getByText(finding.code)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /a.ts/ }));
  expect(evidence).toHaveBeenCalledWith(finding);
  await user.keyboard("{Tab}");
  await user.click(first);
  expect(screen.queryByText(finding.problem)).toBeNull();
});

test("analysis limitations start collapsed and can be toggled without opening findings", async () => {
  render(<ReviewResults job={job} onEvidence={vi.fn()} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: /Analysis limitations/i });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(
    screen.queryByText(
      job.result && "limitations" in job.result
        ? job.result.limitations[0]!
        : "",
    ),
  ).toBeNull();
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(
    screen.getByText("Compiler diagnostics were unavailable."),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Missing guard" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  await user.click(trigger);
  expect(
    screen.queryByText("Compiler diagnostics were unavailable."),
  ).toBeNull();
  expect(screen.queryByText(/reviewed-file checklist/)).toBeNull();
});

test("opening a prompt previews Markdown without copying; only its copy button writes the exact prompt", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const { container } = render(<ReviewResults job={job} />);
  expect(container.querySelector('[data-slot="code-block"]')).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Fix with agent prompt" }),
  );
  expect(write).not.toHaveBeenCalled();
  expect(container.querySelector('[data-slot="code-block-header"]')).toBeNull();
  expect(
    container
      .querySelector('[data-slot="code-block-content"]')
      ?.hasAttribute("data-numbered"),
  ).toBe(false);
  expect(
    container.querySelector('[data-slot="code-block-content"]')?.textContent,
  ).toContain("### Issue 1");
  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(write).toHaveBeenCalledOnce();
  expect(write.mock.calls[0]![0]).toMatch(
    /For each issue above, determine whether it is valid and should be fixed. If so, fix it directly.$/,
  );
});
test("review evidence receives only snapshot contents belonging to that job's hash and round", async () => {
  const user = userEvent.setup();
  const file = { path: finding.path } as PreviewFileSchema;
  const snapshot = {
    id: "snapshot",
    hash: "current",
    round: 2,
    files: [file],
  } as LivePreview;
  const currentJob = { ...job, hash: "current", snapshotRound: 2 };
  const { rerender } = render(
    <ReviewResults job={currentJob} snapshot={snapshot} />,
  );
  await user.click(screen.getByRole("button", { name: "Missing guard" }));
  expect(evidenceState.file).toBe(file);
  rerender(
    <ReviewResults
      job={{ ...currentJob, snapshotRound: 1 }}
      snapshot={snapshot}
    />,
  );
  expect(evidenceState.file).toBeUndefined();
  rerender(
    <ReviewResults job={{ ...currentJob, hash: "old" }} snapshot={snapshot} />,
  );
  expect(evidenceState.file).toBeUndefined();
});
