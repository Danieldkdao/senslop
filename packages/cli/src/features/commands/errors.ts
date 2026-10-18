export class CliError extends Error {
  constructor(
    message: string,
    readonly code = "operation_failed",
    readonly exitCode = 1,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
  }
}
