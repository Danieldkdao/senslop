export { cn } from "cn";

export const isError = (error: unknown): error is Error =>
  error instanceof Error;
