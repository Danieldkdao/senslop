import { expect, test } from "vitest";
import { commandDefinitions } from "../src/features/commands/definitions.js";
import { parseCliCommand } from "../src/features/commands/parse-command.js";
import { formatCommandHelp } from "../src/features/commands/help.js";

test("every registered command has scoped help generated from its accepted options", () => {
  for (const definition of commandDefinitions) {
    const help = formatCommandHelp(definition.name);
    expect(help).toContain(`senslop ${definition.name}`);
    for (const option of definition.options)
      expect(help).toContain(`--${option}`);
    expect(
      parseCliCommand([...definition.name.split(" "), "--help"]).help,
    ).toBe(true);
  }
});

test("agent handoff flags parse without prompting and conflicting choices fail", () => {
  expect(
    parseCliCommand([
      "reviews",
      "create",
      "--working-tree",
      "--group",
      "--open",
      "--wait",
      "--json",
    ]),
  ).toMatchObject({
    name: "reviews create",
    values: {
      "working-tree": true,
      group: true,
      open: true,
      wait: true,
      json: true,
    },
  });
  for (const args of [
    ["reviews", "create", "--group", "--no-group"],
    ["app", "status", "--dev"],
    ["runs", "watch"],
    ["reviews", "list", "extra"],
    ["reviews", "create", "--wat"],
    ["unknown"],
    ["reviews", "sync", "current", "--timeout", "-1"],
  ])
    expect(() => parseCliCommand(args)).toThrow();
});

test("top-level and group help expose the same live command catalog", () => {
  expect(formatCommandHelp()).toContain("app start");
  expect(formatCommandHelp("reviews")).toContain("reviews sync");
  expect(parseCliCommand(["help", "--json"])).toMatchObject({
    name: "help",
    values: { json: true },
  });
  expect(parseCliCommand(["reviews", "--help"])).toMatchObject({
    name: "reviews",
    help: true,
  });
});
