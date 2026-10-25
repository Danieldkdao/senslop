import { expect, test, vi } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { SavedReviewSchema, OrganizationSchema } from "@senslop/contracts";
import { startLocalApp } from "../local-app";
import { connectWorkspace } from "../workspace-client";
import { executeReviewCommand } from "../../reviews/commands";
import { parseCliCommand } from "../../commands/parse-command";
import { waitForJob } from "../../reviews/jobs";
import { startAnalysisProvider } from "./analysis-provider";

// This opt-in exercises the built app and real engine with a deterministic loopback provider.
test.skipIf(process.env.RUN_LOCAL_AI_TESTS !== "1")(
  "background clients retain folders and revisions while another review stays open",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-background-app-"));
    const repository = join(await realpath(directory), "repo");
    const dataDirectory = join(directory, "data");
    await mkdir(repository);
    await mkdir(join(repository, "one"));
    await mkdir(join(repository, "two"));
    const git = (...args: string[]) =>
      promisify(execFile)("git", args, { cwd: repository });
    await git("init", "-qb", "main");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.com");
    await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
    await mkdir(join(repository, ".senslop"));
    await writeFile(
      join(repository, ".senslop/review.json"),
      JSON.stringify({ profiles: ["correctness", "security"] }),
    );
    await writeFile(
      join(repository, "support.py"),
      "def helper():\n    return 1\n",
    );
    await writeFile(
      join(repository, "requirements.md"),
      "Add a distinct requested behavior.\n",
    );
    await git("add", ".");
    await git("commit", "-qm", "baseline");
    await writeFile(join(repository, "a.ts"), "export const a = 2;\n");
    const provider = await startAnalysisProvider();
    let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
    try {
      app = await startLocalApp({
        repository,
        dataDirectory,
        serverPath: fileURLToPath(
          new URL(
            "../../../../dist/local-app/apps/local/server.js",
            import.meta.url,
          ),
        ),
      });
      const firstClient = await connectWorkspace(repository, dataDirectory);
      const open = vi.fn(async () => {});
      const first = (await executeReviewCommand(
        firstClient,
        parseCliCommand(["reviews", "create", "--working-tree", "--no-group"]),
        open,
      )) as { review: SavedReviewSchema };
      expect(open).toHaveBeenCalledTimes(1);
      const saved = await firstClient.request<{ connection: { id: string } }>(
        "/api/providers",
        {
          action: "save",
          connection: {
            provider: "llama-cpp",
            name: "Fixture",
            baseURL: `${provider.origin}/v1`,
            model: "fixture",
            contextWindow: null,
            apiKey: "",
          },
        },
      );
      await firstClient.request(
        "/api/agents/settings",
        {
          shared: {
            connectionId: saved.connection.id,
            modelId: "fixture",
            name: "Fixture",
          },
        },
        "PATCH",
      );
      const one = await connectWorkspace(
        join(repository, "one"),
        dataDirectory,
      );
      const two = await connectWorkspace(
        join(repository, "two"),
        dataDirectory,
      );
      const identity = {
        id: first.review.id,
        hash: first.review.hash,
        round: first.review.round,
      };
      const params = new URLSearchParams({
        reviewId: identity.id,
        hash: identity.hash,
        round: String(identity.round),
      });
      const organization = await firstClient.request<OrganizationSchema>(
        `/api/precision?${params}`,
      );
      expect(organization.units).toHaveLength(1);
      const completed = await firstClient.request<OrganizationSchema>(
        "/api/precision",
        {
          review: identity,
          version: organization.version,
          operation: {
            action: "complete-unit",
            unitId: organization.units[0]!.id,
            reviewed: true,
          },
        },
      );
      expect(
        (
          await firstClient.request<SavedReviewSchema>(
            `/api/workspace?id=${identity.id}`,
          )
        ).completedPaths,
      ).toContain("a.ts");
      await firstClient.request("/api/precision", {
        review: identity,
        version: completed.version,
        operation: {
          action: "complete-unit",
          unitId: organization.units[0]!.id,
          reviewed: false,
        },
      });
      const index = await firstClient.request<{
        capabilities: Record<string, { level: string }>;
        symbols: { name: string; path: string }[];
      }>(`/api/source-explorer?${params}`);
      expect(index.capabilities["support.py"]?.level).toBe("parsing");
      expect(index.symbols).toContainEqual(
        expect.objectContaining({ name: "helper", path: "support.py" }),
      );
      const intent = await firstClient.request<{
        instructions: { profiles: string[] };
        documents: string[];
      }>(`/api/review-intent?reviewId=${identity.id}`);
      expect(intent.instructions.profiles).toContain("security");
      expect(intent.documents).toContain("requirements.md");
      await firstClient.request("/api/review-intent", {
        review: identity,
        operation: {
          action: "save-brief",
          version: 0,
          brief: {
            request: "Add requested behavior",
            documents: [
              { path: "requirements.md", contents: "ignored client copy" },
            ],
            links: [],
            criteria: [
              {
                id: "precision-request",
                text: "Requested behavior exists",
                sourceQuote: "Add requested behavior",
                checkIds: [],
              },
            ],
          },
        },
      });
      const assessed = (await executeReviewCommand(
        firstClient,
        parseCliCommand([
          "reviews",
          "run",
          identity.id,
          "--wait",
          "--timeout",
          "45",
        ]),
      )) as { result: { requirements?: { criteria: { status: string }[] } } };
      expect(assessed.result.requirements?.criteria[0]?.status).toBe("missing");
      provider.pause();
      const create = async (client: typeof one, runReview = false) =>
        executeReviewCommand(
          client,
          parseCliCommand([
            "reviews",
            "create",
            "--working-tree",
            "--group",
            ...(runReview ? ["--run-review"] : []),
          ]),
          open,
        ) as Promise<{
          id: string;
          review: SavedReviewSchema;
          jobIds: string[];
        }>;
      const [second, third] = await Promise.all([
        create(one, true),
        create(two),
      ]);
      expect(new Set([first.review.id, second.id, third.id]).size).toBe(3);
      expect(second.review.directory).toBe(join(repository, "one"));
      expect(third.review.directory).toBe(join(repository, "two"));
      expect(open).toHaveBeenCalledTimes(1);
      expect(
        (
          await firstClient.request<SavedReviewSchema>(
            "/api/workspace?id=current",
          )
        ).id,
      ).toBe(first.review.id);
      const repeated = await Promise.all([
        one.request<{ id: string }>("/api/agents", {
          action: "job",
          snapshotId: second.id,
          kind: "review",
          expectedHash: second.review.hash,
          expectedRound: second.review.round,
        }),
        one.request<{ id: string }>("/api/agents", {
          action: "job",
          snapshotId: second.id,
          kind: "review",
          expectedHash: second.review.hash,
          expectedRound: second.review.round,
        }),
      ]);
      expect(repeated[0]!.id).toBe(repeated[1]!.id);
      provider.release();
      await Promise.all(
        [...second.jobIds, ...third.jobIds].map((id) =>
          waitForJob(firstClient, id, 60),
        ),
      );
      const history = await firstClient.request<{
        history: { id: string; work: { status: string }[] }[];
      }>("/api/workspace?history=1");
      expect(
        history.history.find((review) => review.id === third.id)?.work[0]
          ?.status,
      ).toBe("completed");
      expect(
        (
          await firstClient.request<SavedReviewSchema>(
            `/api/preview?id=${first.review.id}`,
          )
        ).id,
      ).toBe(first.review.id);
      await writeFile(join(repository, "a.ts"), "export const a = 3;\n");
      const updated = await one.request<SavedReviewSchema>("/api/workspace", {
        action: "resync",
        id: second.id,
        mode: "keep",
        expectedHash: second.review.hash,
        expectedRound: second.review.round,
        grouping: false,
        directory: join(repository, "two"),
      });
      expect(updated.round).toBe(2);
      expect(updated.directory).toBe(second.review.directory);
      await expect(
        one.request("/api/workspace", {
          action: "resync",
          id: second.id,
          mode: "keep",
          expectedHash: second.review.hash,
          expectedRound: second.review.round,
        }),
      ).rejects.toMatchObject({ code: "review_conflict", exitCode: 6 });
      await executeReviewCommand(
        one,
        parseCliCommand(["reviews", "open", third.id]),
        open,
      );
      expect(open).toHaveBeenLastCalledWith(one.browserUrl(third.id));
      expect(
        (
          await firstClient.request<SavedReviewSchema>(
            `/api/preview?id=${first.review.id}`,
          )
        ).id,
      ).toBe(first.review.id);
    } finally {
      provider.release();
      await app?.stop();
      await provider.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);
