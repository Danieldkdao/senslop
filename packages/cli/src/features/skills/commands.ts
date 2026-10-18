import { confirm, isCancel, multiselect } from "@clack/prompts";
import { homedir } from "node:os";
import { resolveRepository } from "@senslop/review-core/git";
import type { ParsedCliCommand } from "../commands/types.js";
import { CliError } from "../commands/errors.js";
import { stringOption } from "../commands/input.js";
import { installReviewSkill } from "./install.js";

export const executeSkillCommand = async (
  { values }: ParsedCliCommand,
  repository: string,
) => {
  const requestedAgent = stringOption(values, "agent");
  const scope = stringOption(values, "scope") ?? "project";
  if (
    (requestedAgent !== undefined &&
      requestedAgent !== "agents" &&
      requestedAgent !== "claude") ||
    (scope !== "project" && scope !== "user")
  )
    throw new CliError(
      "Use --agent agents or claude, or --all for both, and --scope project or user.",
      "invalid_arguments",
      2,
    );
  if (
    (values.symlink && values["no-symlink"]) ||
    (values.all && requestedAgent !== undefined)
  )
    throw new CliError(
      "Choose --agent or --all, and --symlink or --no-symlink, not both choices.",
      "invalid_arguments",
      2,
    );
  const interactive =
    !!(process.stdin.isTTY && process.stdout.isTTY) && !values.json;
  let agent: "agents" | "claude" | "both" | undefined = values.all
    ? "both"
    : requestedAgent;
  if (!agent) {
    if (!interactive)
      throw new CliError(
        "Choose --agent agents, --agent claude, or --all for automated installation.",
        "invalid_arguments",
        2,
      );
    const selected = await multiselect<"agents" | "claude">({
      message:
        "Install skills for which agents? Space selects, Enter confirms; select none to install both.",
      options: [
        { value: "claude", label: "Claude", hint: ".claude/skills" },
        { value: "agents", label: "All other agents", hint: ".agents/skills" },
      ],
      initialValues: [],
      required: false,
    });
    if (isCancel(selected))
      throw new CliError("Canceled. No skills installed.", "canceled");
    agent = selected.length === 1 ? selected[0]! : "both";
  }
  if (agent !== "both" && (values.symlink || values["no-symlink"]))
    throw new CliError(
      "Symlink options require --all or both targets selected.",
      "invalid_arguments",
      2,
    );
  let link = !!values.symlink;
  if (agent === "both" && !values.symlink && !values["no-symlink"]) {
    if (!interactive)
      throw new CliError(
        "Installing both targets requires --symlink or --no-symlink outside an interactive terminal.",
        "invalid_arguments",
        2,
      );
    const answer = await confirm({
      message:
        "Create a symlink from .claude/skills/senslop-review/SKILL.md to .agents/skills/senslop-review/SKILL.md so both share one file?",
      initialValue: false,
    });
    if (isCancel(answer))
      throw new CliError("Canceled. No skills installed.", "canceled");
    link = answer;
  }
  const root =
    scope === "user" ? homedir() : await resolveRepository(repository);
  return installReviewSkill(root, agent, link);
};
