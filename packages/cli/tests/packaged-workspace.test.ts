import { afterEach, expect, test } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

import { LocalStore } from "@senslop/review-core/storage";
import { applicationDataDirectory } from "../src/features/workspace/local-app";
import { ProviderService } from "../../../apps/local/src/features/providers/lib/provider-service";
import { osCredentials } from "../../../apps/local/src/services/credentials/os-credentials";

const execute = promisify(execFile);
const children = new Set<ChildProcess>();
let scratch: string | undefined;
const fixtureRepositories = new Set<string>();
let fixtureConnection: string | undefined;
let priorDefault: string | null | undefined;
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "exit");
      child.kill("SIGTERM");
      await closed;
    }
  }
  children.clear();
  if (fixtureRepositories.size) {
    const store = new LocalStore(
      join(applicationDataDirectory(), "reviews.sqlite"),
    );
    try {
      const service = new ProviderService(store, osCredentials);
      if (
        fixtureConnection &&
        (await service.list()).connections.some(
          (connection) => connection.id === fixtureConnection,
        )
      )
        await service.delete(fixtureConnection);
      if (priorDefault !== undefined) await service.setDefault(priorDefault);
      for (const repository of fixtureRepositories)
        for (const review of store.listReviews(repository))
          store.deleteReview(repository, review.id);
    } finally {
      store.close();
    }
  }
  fixtureRepositories.clear();
  fixtureConnection = undefined;
  priorDefault = undefined;
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
    const runtimeCache = join(
      packageDirectory,
      "dist/local-app/apps/local/.next/server/route-cache/packaging-test",
    );
    await mkdir(runtimeCache, { recursive: true });
    await writeFile(
      join(runtimeCache, "cached.html"),
      "disposable-runtime-cache",
    );
    const packed = await execute(
      "npm",
      ["pack", "--json", "--pack-destination", scratch],
      { cwd: packageDirectory, maxBuffer: 8 * 1024 * 1024 },
    ).finally(() => rm(runtimeCache, { recursive: true, force: true }));
    const archive = JSON.parse(packed.stdout)[0] as {
      filename: string;
      files: { path: string }[];
    };
    const paths = archive.files.map((file) => file.path);
    expect(paths.some((path) => path.endsWith("apps/local/server.js"))).toBe(
      true,
    );
    expect(paths.some((path) => path.includes(".next/static/"))).toBe(true);
    expect(paths.some((path) => path.includes("/route-cache/"))).toBe(false);
    expect(
      paths.some((path) =>
        /\.next\/node_modules\/@napi-rs\/keyring-[^/]+\/index\.js$/.test(path),
      ),
    ).toBe(true);
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
    fixtureRepositories.add(await realpath(repo));
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
      expect(html).toContain("New review");
      expect(html).toContain("Use the New review button");
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
    const origin = new URL(url).origin;
    const headers = { Cookie: cookie };
    const post = async (path: string, body: unknown) => {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      expect(response.ok, result?.message).toBe(true);
      return result;
    };
    expect(
      await (
        await fetch(`${new URL(url).origin}/api/preview`, {
          headers: { Cookie: cookie },
        })
      ).json(),
    ).toHaveProperty("files");
    const browserSources = [
      { kind: "working-tree" },
      { kind: "commit", commit: "feature" },
      { kind: "range", base: "main", head: "feature" },
      { kind: "branch", branch: "feature", base: "HEAD" },
    ];
    let browserReview;
    for (const source of browserSources)
      browserReview = await post("/api/workspace", {
        action: "inspect",
        source,
      });
    expect(browserReview).toHaveProperty("hash");
    const browserId = browserReview.id;
    const note = {
      id: randomUUID(),
      previewId: browserId,
      path: "sample.ts",
      body: "Persistent packaged feedback",
      line: {
        side: "additions",
        lineNumber: 1,
        code: "export const sample = 2;",
      },
    };
    await post("/api/workspace", {
      action: "change",
      id: browserId,
      change: { action: "add-note", note },
    });
    await post("/api/workspace", {
      action: "change",
      id: browserId,
      change: { action: "complete", path: "sample.ts", complete: true },
    });
    await post("/api/workspace", {
      action: "change",
      id: browserId,
      change: { action: "rename", title: "Packaged saved review" },
    });
    const searched = await (
      await fetch(`${origin}/api/workspace?history=1&search=Packaged%20saved`, {
        headers,
      })
    ).json();
    expect(searched.repository).toBeNull();
    expect(searched.history.map((review: { id: string }) => review.id)).toEqual(
      [browserId],
    );
    expect(
      (
        await (
          await fetch(
            `${origin}/api/workspace?history=1&search=missing-title`,
            { headers },
          )
        ).json()
      ).history,
    ).toEqual([]);
    const refreshed = await (
      await fetch(`${origin}/api/preview`, { headers })
    ).json();
    expect(refreshed.notes).toEqual([note]);
    expect(refreshed.completedPaths).toEqual(["sample.ts"]);
    await writeFile(join(repo, "sample.ts"), "export const sample = 4;\n");
    const metadata = await (
      await fetch(`${origin}/api/workspace`, { headers })
    ).json();
    expect(metadata.repository.fingerprint).not.toBe(refreshed.fingerprint);
    const hostile = await fetch(`${origin}/api/workspace`, {
      method: "POST",
      headers: {
        ...headers,
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "inspect",
        source: { kind: "working-tree" },
      }),
    });
    expect(hostile.status).toBe(403);
    const escaped = await fetch(`${origin}/api/workspace`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "inspect",
        source: { kind: "working-tree", cwd: "/another/repository" },
      }),
    });
    expect(escaped.ok).toBe(false);
    const providerKey = randomUUID();
    let probeRequests = 0;
    let inferenceRequests = 0;
    const provider = createServer((request, response) => {
      if (request.method === "POST" && request.url === "/api/chat") {
        inferenceRequests++;
        expect(request.headers.authorization).toBe(`Bearer ${providerKey}`);
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        request.on("end", () => {
          const input = JSON.parse(body);
          expect(input.model).toBe("packaged-model");
          expect(input.stream).toBe(false);
          expect(input.options.num_ctx).toBe(8192);
          expect(input.options.num_predict).toBe(2048);
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              model: "packaged-model",
              created_at: new Date().toISOString(),
              message: {
                role: "assistant",
                content: "Packaged AI fixture response",
              },
              done: true,
              done_reason: "stop",
              prompt_eval_count: 1,
              eval_count: 1,
            }),
          );
        });
        return;
      }
      probeRequests++;
      expect(request.method).toBe("GET");
      expect(request.url).toBe("/api/tags");
      expect(request.headers.authorization).toBe(`Bearer ${providerKey}`);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ models: [{ name: "packaged-model" }] }));
    });
    provider.listen(0, "127.0.0.1");
    await once(provider, "listening");
    const address = provider.address();
    if (!address || typeof address === "string")
      throw new Error("Missing provider port");
    let connectionId: string | undefined;
    try {
      const saved = await post("/api/providers", {
        action: "save",
        connection: {
          provider: "ollama",
          name: "Packaged credential test",
          baseURL: `http://127.0.0.1:${address.port}`,
          model: "",
          contextWindow: 8192,
          apiKey: providerKey,
        },
      });
      connectionId = saved.connection.id;
      fixtureConnection = connectionId;
      expect(saved.connection.configured).toBe(true);
      expect(JSON.stringify(saved)).not.toContain(providerKey);
      expect(probeRequests).toBe(0);
      priorDefault = (
        await (await fetch(`${origin}/api/providers`, { headers })).json()
      ).defaultId;
      await post("/api/providers", { action: "default", id: connectionId });
      const tested = await post("/api/providers", {
        action: "test",
        id: connectionId,
      });
      expect(tested.models).toEqual(["packaged-model"]);
      const models = await post("/api/providers", {
        action: "models",
        id: connectionId,
      });
      expect(models.models).toEqual(["packaged-model"]);
      expect(probeRequests).toBe(2);
      expect((await fetch(`${origin}/ai-test`)).status).toBe(403);
      const aiPage = await fetch(`${origin}/ai-test`, { headers });
      expect(aiPage.status).toBe(200);
      expect(await aiPage.text()).toContain("AI test");
      const catalog = await fetch(
        `${origin}/api/providers/models?connectionId=${connectionId}`,
        { headers },
      );
      expect(catalog.status).toBe(200);
      expect(await catalog.json()).toMatchObject({
        models: [
          { id: "packaged-model", name: "Packaged Model", available: true },
        ],
        source: "live",
      });
      const reply = await post("/api/ai-test", {
        connectionId,
        modelId: "packaged-model",
        messages: [{ role: "user", content: "Test packaged inference" }],
      });
      expect(reply).toEqual({ text: "Packaged AI fixture response" });
      expect(inferenceRequests).toBe(1);

      const settingsPage = await fetch(`${origin}/settings/providers`, {
        headers,
      });
      expect(settingsPage.status).toBe(404);
      const workspacePage = await fetch(origin, { headers });
      expect(await workspacePage.text()).toContain("Settings");
    } finally {
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    }
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
    children.delete(child);
    expect(
      (await readFile(join(scratch, "browser-open.txt"), "utf8")).trim(),
    ).toBe(url);
    const restarted = await start(cli, repo, ["connect"]);
    const restartOrigin = new URL(restarted.url).origin;
    const restartSession = await fetch(restarted.url, { redirect: "manual" });
    const restartHeaders = {
      Cookie: restartSession.headers.get("set-cookie")!.split(";")[0]!,
    };
    const restored = await (
      await fetch(`${restartOrigin}/api/preview`, { headers: restartHeaders })
    ).json();
    expect(restored).toMatchObject({
      id: browserId,
      title: "Packaged saved review",
      notes: [note],
      completedPaths: ["sample.ts"],
    });
    const configurations = await (
      await fetch(`${restartOrigin}/api/providers`, { headers: restartHeaders })
    ).json();
    expect(configurations.defaultId).toBe(connectionId);
    expect(
      configurations.connections.find(
        (item: { id: string }) => item.id === connectionId,
      ),
    ).toMatchObject({ configured: true, contextWindow: 8192 });
    expect(JSON.stringify(configurations)).not.toContain(providerKey);
    const remove = await fetch(`${restartOrigin}/api/providers`, {
      method: "POST",
      headers: { ...restartHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: connectionId }),
    });
    expect(remove.ok).toBe(true);
    expect(await remove.json()).toHaveProperty("warning", null);
    const secondRepo = join(scratch, "second-repo");
    await execute("git", ["clone", "--no-hardlinks", repo, secondRepo]);
    const separate = await start(cli, secondRepo, ["connect"]);
    const separateSession = await fetch(separate.url, { redirect: "manual" });
    const separateHeaders = {
      Cookie: separateSession.headers.get("set-cookie")!.split(";")[0]!,
    };
    const separateMetadata = await (
      await fetch(`${new URL(separate.url).origin}/api/workspace`, {
        headers: separateHeaders,
      })
    ).json();
    expect(separateMetadata.history).toEqual([]);
    const separateEnded = once(separate.child, "exit");
    separate.child.kill("SIGTERM");
    await separateEnded;
    children.delete(separate.child);
    const history = await (
      await fetch(`${restartOrigin}/api/workspace?history=1`, {
        headers: restartHeaders,
      })
    ).json();
    for (const review of history.history) {
      const deleted = await fetch(`${restartOrigin}/api/workspace`, {
        method: "POST",
        headers: { ...restartHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: review.id }),
      });
      expect(deleted.ok).toBe(true);
    }
    expect(
      await (
        await fetch(`${restartOrigin}/api/preview`, { headers: restartHeaders })
      ).json(),
    ).toBeNull();
    const restartEnded = once(restarted.child, "exit");
    restarted.child.kill("SIGTERM");
    await restartEnded;
    children.delete(restarted.child);
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
