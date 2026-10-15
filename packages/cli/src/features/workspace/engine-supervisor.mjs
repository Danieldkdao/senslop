import { spawn } from "node:child_process";

const [engine, ...args] = process.argv.slice(2);
const child = spawn(
  engine.endsWith(".mjs") ? process.execPath : engine,
  engine.endsWith(".mjs") ? [engine, ...args] : args,
  { stdio: "ignore", env: process.env },
);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 5000).unref();
};
process.once("disconnect", stop);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
child.once("error", () => process.exit(1));
child.once("exit", (code) => process.exit(stopping ? 0 : code || 1));
