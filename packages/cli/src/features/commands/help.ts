import { providerIds } from "@senslop/contracts";
import cliPackage from "../../../package.json";
import {
  commandDefinitions,
  globalOptions,
  optionDefinitions,
} from "./definitions.js";

export const commandCatalog = () => ({
  version: cliPackage.version,
  commands: commandDefinitions,
  options: optionDefinitions,
  globalOptions,
  providerIds,
  exitCodes: {
    success: 0,
    failure: 1,
    usageOrSnapshotIneligible: 2,
    appUnavailable: 3,
    analysisFailed: 4,
    timeout: 5,
    reviewConflict: 6,
  },
});

export const formatCommandHelp = (name = "") => {
  const commands = commandDefinitions.filter(
    (item) => !name || item.name === name || item.name.startsWith(`${name} `),
  );
  if (!commands.length) throw new Error(`Unknown help topic: ${name}.`);
  const selected =
    commands.find((command) => command.name === name) ??
    (commands.length === 1 ? commands[0] : undefined);
  const lines = [
    "Senslop — prepare local changes for human review",
    "",
    `Usage: senslop ${selected ? `${selected.name} ${selected.arguments ?? ""}`.trim() : `${name ? `${name} ` : ""}COMMAND`} [options]`,
    "",
  ];
  for (const command of commands)
    lines.push(
      `  ${command.name}${command.arguments ? ` ${command.arguments}` : ""}`,
      `    ${command.description}`,
    );
  lines.push("", "Options:");
  for (const key of [...globalOptions, ...(selected?.options ?? [])]) {
    const option = optionDefinitions[key]!;
    lines.push(
      `  --${key}${option.type === "string" ? " VALUE" : ""}  ${option.description}`,
    );
  }
  lines.push(
    "",
    "Start the app in one terminal: senslop app start",
    "From another terminal: senslop reviews create --working-tree --group --open --wait --json",
    "Choose commit/range/branch instead when that describes the intended change.",
    "Read command-specific help with senslop COMMAND SUBCOMMAND --help.",
    "Exit codes: 0 success; 1 failure; 2 invalid usage or standalone snapshot ineligible; 3 app unavailable; 4 analysis failed/canceled; 5 timeout.",
  );
  return lines.join("\n");
};
