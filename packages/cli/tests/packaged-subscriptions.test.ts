import { expect, test } from "vitest";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// This opt-in packaging check runs tooling with isolated home/config directories.
const packageTest = test.skipIf(process.env.SENSLOP_PACK_TEST !== "1");
packageTest(
  "the packaged subscription providers include a working native Claude executable and MCP runtime",
  async () => {
    const scratch = await mkdtemp(
      join(tmpdir(), "senslop-subscription-package-"),
    );
    try {
      const source = fileURLToPath(
        new URL("../dist/local-app/", import.meta.url),
      );
      const installation = join(scratch, "app");
      await cp(source, installation, { recursive: true, dereference: true });
      const require = createRequire(join(installation, "apps/local/server.js"));
      const sdk = createRequire(
        require.resolve("@anthropic-ai/claude-agent-sdk"),
      );
      const platform = `${process.platform}-${process.arch}`;
      const executable = join(
        dirname(
          sdk.resolve(
            `@anthropic-ai/claude-agent-sdk-${platform}/package.json`,
          ),
        ),
        process.platform === "win32" ? "claude.exe" : "claude",
      );
      const version = await promisify(execFile)(executable, ["--version"], {
        env: {
          PATH: process.env.PATH,
          HOME: scratch,
          USERPROFILE: scratch,
          CLAUDE_CONFIG_DIR: join(scratch, "claude"),
        },
        timeout: 15000,
      });
      expect(version.stdout).toContain("Claude Code");
      const aliases = join(installation, "apps/local/.next/node_modules");
      const provider = (await readdir(aliases)).find((name) =>
        name.startsWith("ai-sdk-provider-claude-code-"),
      );
      expect(provider).toBeTruthy();
      const runtime = await import(join(aliases, provider!, "dist/index.js"));
      expect(runtime.createAiSdkMcpServer).toBeTypeOf("function");
      expect(runtime.claudeCode).toBeTypeOf("function");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
  60000,
);

packageTest(
  "packaged ChatGPT preparation retains the numeric loopback OAuth callback",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-oauth-origin-"));
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test port.");
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const origin = `http://127.0.0.1:${address.port}`;
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../dist/local-app/apps/local/server.js", import.meta.url),
        ),
      ],
      {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "production",
          HOSTNAME: "127.0.0.1",
          PORT: String(address.port),
          SENSLOP_LOCAL_ORIGIN: origin,
          SENSLOP_LOCAL_TOKEN: "d".repeat(64),
          SENSLOP_LOCAL_DATABASE: join(directory, "local.sqlite"),
          SENSLOP_LOCAL_SNAPSHOT: join(directory, "snapshot.json"),
          SENSLOP_LOCAL_REPOSITORY: process.cwd(),
        },
        stdio: "ignore",
      },
    );
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100 && !ready; attempt++) {
        ready = await fetch(origin).then(
          () => true,
          () => false,
        );
        if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(ready).toBe(true);
      const headers = {
        authorization: `Bearer ${"d".repeat(64)}`,
        "Content-Type": "application/json",
      };
      const response = await fetch(`${origin}/api/providers/subscriptions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "sign-in",
          provider: "chatgpt-subscription",
        }),
      });
      expect(response.status).toBe(200);
      const flow = await response.json();
      expect(flow.status, flow.error).toBe("pending");
      const authorization = new URL(flow.url);
      expect(authorization.origin).toBe("https://auth.openai.com");
      expect(authorization.searchParams.get("redirect_uri")).toBe(
        `${origin}/auth/callback`,
      );
      await fetch(`${origin}/api/providers/subscriptions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "cancel", id: flow.id }),
      });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        await closed;
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
  15000,
);
