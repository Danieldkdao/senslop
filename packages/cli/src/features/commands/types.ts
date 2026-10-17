export type CliValues = Record<string, string | boolean | undefined>;

export type CommandDefinition = {
  name: string;
  description: string;
  arguments?: string;
  minArgs?: number;
  maxArgs?: number;
  options: string[];
};

export type ParsedCliCommand = {
  name: string;
  args: string[];
  values: CliValues;
  help: boolean;
};
