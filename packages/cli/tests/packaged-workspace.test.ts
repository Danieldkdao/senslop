import { afterEach, expect, test } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const execute = promisify(execFile);
const children = new Set<ChildProcess>();
let scratch: string | undefined;
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "exit");
      child.kill("SIGTERM");
      await closed;
    }
  }
  children.clear();
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

const start = (cli: string, cwd: string, args: string[]) =>
  new Promise<{ child: ChildProcess; url: string }>((resolve, reject) => {
    // Package verification intentionally provides no application or cloud environment variables.
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: {
        PATH: `${join(scratch!, "bin")}:${process.env.PATH}`,
        SENSLOP_BROWSER_TEST_OUTPUT: join(scratch!, "browser-open.txt"),
        TMPDIR: scratch,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    const timeout = setTimeout(
      () => reject(new Error(`CLI did not start: ${output}`)),
      30000,
    );
    const collect = (bytes: Buffer) => {
      output += bytes.toString();
      const url = output.match(
        /http:\/\/127\.0\.0\.1:\d+\/api\/session\?token=[a-f0-9]{64}/,
      )?.[0];
      if (url) {
        clearTimeout(timeout);
        resolve({ child, url });
      }
    };
    child.stdout!.on("data", collect);
    child.stderr!.on("data", collect);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`CLI exited ${code}: ${output}`));
    });
  });

// This opt-in package test is tooling, so its selection flag is read outside application env modules.
const packageTest = test.skipIf(process.env.SENSLOP_PACK_TEST !== "1");
packageTest(
  "the clean CLI archive launches all Git inputs, serves local assets and dies with its parent",
  async () => {
    scratch = await mkdtemp(join(tmpdir(), "senslop-package-test-"));
    await mkdir(join(scratch, "bin"));
    // Capture the OS browser-launch command without opening disposable graphical tabs.
    await writeFile(
      join(scratch, "bin/open"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$SENSLOP_BROWSER_TEST_OUTPUT"\n',
      { mode: 0o755 },
    );
    const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
    const packed = await execute(
      "npm",
      ["pack", "--json", "--pack-destination", scratch],
      { cwd: packageDirectory, maxBuffer: 8 * 1024 * 1024 },
    );
    const archive = JSON.parse(packed.stdout)[0] as {
      filename: string;
      files: { path: string }[];
    };
    const paths = archive.files.map((file) => file.path);
    expect(paths.some((path) => path.endsWith("apps/local/server.js"))).toBe(
      true,
    );
    expect(paths.some((path) => path.includes(".next/static/"))).toBe(true);
    expect(
      paths.some((path) =>
        /(^|\/)\.env|better-auth|node-mailjet|senslop\/database/.test(path),
      ),
    ).toBe(false);
    const installation = join(scratch, "install");
    await execute(
      "npm",
      [
        "install",
        "--prefix",
        installation,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--omit=dev",
        join(scratch, archive.filename),
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    const cli = join(installation, "node_modules/@senslop/cli/dist/index.js");
    const repo = join(scratch, "repo");
    await execute("git", ["init", "--initial-branch=main", repo]);
    const git = (args: string[]) => execute("git", args, { cwd: repo });
    await git(["config", "user.name", "Senslop fixture"]);
    await git(["config", "user.email", "fixture@example.invalid"]);
    await writeFile(join(repo, "sample.ts"), "export const sample = 1;\n");
    await git(["add", "."]);
    await git(["commit", "-m", "test: baseline"]);
    await git(["checkout", "-b", "feature"]);
    await writeFile(join(repo, "sample.ts"), "export const sample = 2;\n");
    await git(["commit", "-am", "test: changed sample"]);
    await git(["checkout", "main"]);
    await writeFile(join(repo, "sample.ts"), "export const sample = 3;\n");
    const modes = [
      ["--working-tree"],
      ["--commit", "feature"],
      ["--range", "main..feature"],
      ["--branch", "feature"],
    ];
    for (const [index, mode] of modes.entries()) {
      const { child, url } = await start(cli, repo, ["inspect", ...mode]);
      const origin = new URL(url).origin;
      expect((await fetch(`${origin}/api/preview`)).status).toBe(403);
      const session = await fetch(url, { redirect: "manual" });
      expect(session.status).toBe(307);
      const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
      expect(session.headers.get("set-cookie")).toContain("HttpOnly");
      const headers = { Cookie: cookie };
      const page = await fetch(origin, { headers });
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("Review canvas");
      expect(html).not.toContain("Open account menu");
      const response = await fetch(`${origin}/api/preview`, { headers });
      const snapshot = (await response.json()) as {
        files: { path: string; after: string }[];
      };
      expect(snapshot.files[0].path).toBe("sample.ts");
      expect(snapshot.files[0].after).toContain(index === 0 ? "= 3" : "= 2");
      expect(
        (
          await fetch(`${origin}/api/preview`, {
            headers: {
              ...headers,
              "If-None-Match": response.headers.get("etag")!,
            },
          })
        ).status,
      ).toBe(304);
      expect(
        (
          await fetch(`${origin}/api/preview`, {
            headers: { ...headers, Origin: "https://evil.example" },
          })
        ).status,
      ).toBe(403);
      const icon = await fetch(`${origin}/file-icons/5.39.0/typescript.svg`, {
        headers,
      });
      expect(icon.status).toBe(200);
      expect(await icon.text()).toContain("<svg");
      const script = html.match(/src="([^"]*\/_next\/static\/[^"]+\.js)"/)?.[1];
      expect(script).toBeTruthy();
      expect((await fetch(new URL(script!, origin))).status).toBe(200);
      const ended = once(child, "exit");
      child.kill(index === modes.length - 1 ? "SIGKILL" : "SIGTERM");
      await ended;
      let alive = true;
      for (let attempt = 0; attempt < 30 && alive; attempt++) {
        alive = await fetch(origin).then(
          () => true,
          () => false,
        );
        if (alive) await sleep(100);
      }
      expect(alive).toBe(false);
      children.delete(child);
    }
    const json = await execute(
      process.execPath,
      [cli, "inspect", "--working-tree", "--json"],
      { cwd: repo },
    ).catch((error: { stdout: string; code: number }) => {
      expect(error.code).toBe(2);
      return error;
    });
    expect(JSON.parse(json.stdout).files[0].path).toBe("sample.ts");
    const { child, url } = await start(cli, repo, ["connect"]);
    const session = await fetch(url, { redirect: "manual" });
    const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
    expect(
      await (
        await fetch(`${new URL(url).origin}/api/preview`, {
          headers: { Cookie: cookie },
        })
      ).json(),
    ).toBeNull();
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
    children.delete(child);
    expect(
      (await readFile(join(scratch, "browser-open.txt"), "utf8")).trim(),
    ).toBe(url);
    // Graceful sessions are removed; the SIGKILL fixture is cleaned with its enclosing scratch folder.
    const entries = await readdir(scratch);
    expect(
      entries.filter((name) => name.startsWith("senslop-workspace-")).length,
    ).toBeLessThanOrEqual(1);
    expect(
      await readFile(
        join(installation, "node_modules/@senslop/cli/package.json"),
        "utf8",
      ),
    ).toContain('"node": ">=24"');
  },
  180000,
);
