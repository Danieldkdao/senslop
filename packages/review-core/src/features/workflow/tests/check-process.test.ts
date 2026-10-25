import { expect, test } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheckProcess } from "../check-process";
test("execution reports output and exit code while cancellation stops child processes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-process-"));
  try {
    await writeFile(
      join(directory, "pass.cjs"),
      "console.log('check evidence'); process.exitCode=3;",
    );
    let output = "";
    const result = await runCheckProcess({
      command: `\"${process.execPath}\" pass.cjs`,
      cwd: directory,
      timeoutSeconds: 3,
      signal: new AbortController().signal,
      onOutput: (text) => {
        output += text;
      },
    });
    expect(result.exitCode).toBe(3);
    expect(output).toContain("check evidence");
    await writeFile(
      join(directory, "child.cjs"),
      "const fs=require('node:fs'); setTimeout(()=>fs.writeFileSync('escaped','bad'),600);setInterval(()=>{},1000);",
    );
    await writeFile(
      join(directory, "parent.cjs"),
      "require('node:child_process').spawn(process.execPath,['child.cjs'],{stdio:'inherit'});setInterval(()=>{},1000);",
    );
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 150);
    const canceled = await runCheckProcess({
      command: `\"${process.execPath}\" parent.cjs`,
      cwd: directory,
      timeoutSeconds: 3,
      signal: abort.signal,
      onOutput: () => {},
    });
    clearTimeout(timer);
    expect(canceled.canceled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 750));
    await expect(readFile(join(directory, "escaped"))).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
