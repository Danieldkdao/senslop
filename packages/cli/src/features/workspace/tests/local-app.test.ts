import { afterEach, expect, test } from "vitest";
import {
  cp,
  symlink,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalApp as startApp } from "../local-app.js";

const directories: string[] = [];

const startLocalApp = async (options: Parameters<typeof startApp>[0] = {}) => {
  const dataDirectory =
    options.dataDirectory ??
    (await mkdtemp(join(tmpdir(), "senslop-app-data-")));
  if (!options.dataDirectory) directories.push(dataDirectory);
  return startApp({ ...options, dataDirectory });
};
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) =>
      rm(path, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      }),
    ),
  );
});

const fixture = async (code?: string) => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-local-test-"));
  directories.push(directory);
  // This fixture imitates the generated server's runtime environment contract.
  await writeFile(
    join(directory, "server.cjs"),
    code ??
      `
    const http = require('node:http');
    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Senslop-Session', process.env.SENSLOP_LOCAL_TOKEN);
      res.end(JSON.stringify({ token: process.env.SENSLOP_LOCAL_TOKEN, database: process.env.DATABASE_URL ?? null }));
    }).listen(Number(process.env.PORT), process.env.HOSTNAME);
  `,
  );
  return join(directory, "server.cjs");
};

test("a local app starts without cloud credentials, atomically receives snapshots and releases its port", async () => {
  const serverPath = await fixture();
  const app = await startLocalApp({ jobs: false, serverPath });
  try {
    const response = await fetch(new URL("/api/health", app.origin));
    expect(response.ok).toBe(true);
    expect(
      ((await response.json()) as { database: string | null }).database,
    ).toBeNull();
    const snapshot = {
      source: {
        kind: "working-tree",
        base: "a".repeat(40),
        head: null,
        firstParent: false,
      },
      files: [
        {
          path: "a.ts",
          oldPath: null,
          status: "A",
          before: null,
          after: "one\n",
          beforeHash: null,
          afterHash: "a".repeat(64),
          binary: false,
          added: 1,
          deleted: 0,
          diff: "patch",
        },
      ],
      excluded: [],
    };
    await app.setSnapshot(snapshot);
    const saved = JSON.parse(await readFile(app.snapshotPath, "utf8"));
    expect(saved.files[0].after).toBe("one\n");
    expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(saved.protocolVersion).toBe(1);
    expect(app.url).toContain("/api/session?token=");
  } finally {
    await app.stop();
  }
  await expect(fetch(app.origin)).rejects.toThrow();
  await expect(readFile(app.snapshotPath)).rejects.toThrow();
});

test("aborting the workspace shuts down its child and resolves the lifetime", async () => {
  const signal = new AbortController();
  const app = await startLocalApp({
    jobs: false,
    serverPath: await fixture(),
    signal: signal.signal,
  });
  signal.abort();
  await app.closed;
  await expect(fetch(app.origin)).rejects.toThrow();
});

test("an exited child fails startup promptly instead of leaving a connection loop running", async () => {
  await expect(
    startLocalApp({
      jobs: false,
      serverPath: await fixture("process.exit(7)"),
      startupTimeout: 2000,
    }),
  ).rejects.toThrow(/exited|start/i);
});

test("a missing bundled server explains that the CLI must be built", async () => {
  await expect(
    startLocalApp({ jobs: false, serverPath: "/missing/senslop/server.js" }),
  ).rejects.toThrow(/build|bundle/i);
});

test("development launches the workspace Next CLI without a production bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-development-test-"));
  directories.push(directory);
  const nextDirectory = join(directory, "node_modules/next");
  await mkdir(join(nextDirectory, "dist/bin"), { recursive: true });
  await writeFile(join(directory, "package.json"), '{"name":"local-fixture"}');
  await writeFile(join(nextDirectory, "package.json"), '{"name":"next"}');
  await writeFile(
    join(nextDirectory, "dist/bin/next.js"),
    `const http = require('node:http');
    const args = process.argv.slice(2);
    http.createServer((req, res) => {
      res.setHeader('X-Senslop-Session', process.env.SENSLOP_LOCAL_TOKEN);
      res.end(JSON.stringify({ args, cwd: process.cwd(), mode: process.env.NODE_ENV }));
    }).listen(Number(args[args.indexOf('--port') + 1]), args[args.indexOf('--hostname') + 1]);`,
  );
  const app = await startLocalApp({
    jobs: false,
    development: true,
    appDirectory: directory,
    serverPath: "/missing/production/server.js",
  });
  try {
    const response = await fetch(new URL("/api/health", app.origin));
    const data = (await response.json()) as {
      mode: string;
      cwd: string;
      args: string[];
    };
    expect(data.mode).toBe("development");
    expect(data.cwd).toBe(await realpath(directory));
    expect(data.args).toEqual([
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      new URL(app.origin).port,
    ]);
  } finally {
    await app.stop();
  }
  await expect(fetch(app.origin)).rejects.toThrow();
});

test("a missing development workspace explains the checkout requirement", async () => {
  await expect(
    startLocalApp({
      jobs: false,
      development: true,
      appDirectory: "/missing/workspace",
    }),
  ).rejects.toThrow(/development.*checkout|checkout.*development/i);
});

// This opt-in controls test tooling, rather than application environment configuration.
test.skipIf(process.env.RUN_LOCAL_DEV_TESTS !== "1")(
  "the real Next development app serves the protected dashboard and shared styles, then releases its port",
  async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "senslop-dev-data-"));
    directories.push(dataDirectory);
    const source = fileURLToPath(
      new URL("../../../../../../apps/local/", import.meta.url),
    );
    const cache = resolve(source, "../../.cache");
    await mkdir(cache, { recursive: true });
    const appDirectory = await mkdtemp(join(cache, "local-dev-smoke-"));
    directories.push(appDirectory);
    for (const name of [
      "package.json",
      "next.config.ts",
      "next-env.d.ts",
      "postcss.config.mjs",
    ])
      await cp(join(source, name), join(appDirectory, name));
    await cp(join(source, "src"), join(appDirectory, "src"), {
      recursive: true,
    });
    await symlink(
      join(source, "node_modules"),
      join(appDirectory, "node_modules"),
    );
    const config = JSON.parse(
      await readFile(join(source, "tsconfig.json"), "utf8"),
    );
    for (const [name, paths] of Object.entries(
      config.compilerOptions.paths as Record<string, string[]>,
    ))
      if (name !== "@/*")
        config.compilerOptions.paths[name] = paths.map((path) =>
          relative(appDirectory, resolve(source, path)),
        );
    await writeFile(
      join(appDirectory, "tsconfig.json"),
      JSON.stringify(config),
    );
    const app = await startLocalApp({
      appDirectory,
      development: true,
      startupTimeout: 30000,
      dataDirectory,
    });
    try {
      expect((await fetch(app.origin)).status).toBe(403);
      const session = await fetch(app.url, { redirect: "manual" });
      expect(session.status).toBe(307);
      const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
      const page = await fetch(app.origin, { headers: { Cookie: cookie } });
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("Review canvas");
      const css = html.match(/href="([^"]*\/_next\/static\/[^"]+\.css)"/)?.[1];
      expect(css).toBeTruthy();
      const stylesheet = await fetch(new URL(css!, app.origin));
      expect(stylesheet.status).toBe(200);
      const cssContent = await stylesheet.text();
      expect(cssContent).toContain("--background");
      expect(cssContent).toContain(".bg-sidebar");
      expect(
        await (
          await fetch(`${app.origin}/api/preview`, {
            headers: { Cookie: cookie },
          })
        ).json(),
      ).toBeNull();
    } finally {
      await app.stop();
    }
    await expect(fetch(app.origin)).rejects.toThrow();
  },
  120000,
);
