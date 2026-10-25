import { executePrecisionCommand } from "../precision/commands.js";
import { randomUUID } from "node:crypto";
import open from "open";
import type { SavedReviewSchema, ReviewChangeSchema } from "@senslop/contracts";
import type { ParsedCliCommand } from "../commands/types.js";
import { CliError } from "../commands/errors.js";
import {
  confirmDestructive,
  integerOption,
  noteBody,
  stringOption,
} from "../commands/input.js";
import { sourceFromOptions } from "../commands/source.js";
import type { WorkspaceClient } from "../workspace/workspace-client.js";
import { readAllJobs, startJob, waitForJob } from "./jobs.js";
import type { ReviewJob } from "./types.js";
import { readReview } from "./requests.js";
import { executeWorkflowCommand } from "../workflow/commands.js";
export { readReview } from "./requests.js";

const changeReview = (
  client: WorkspaceClient,
  review: SavedReviewSchema,
  change: ReviewChangeSchema,
) =>
  client.request<SavedReviewSchema>("/api/workspace", {
    action: "change",
    id: review.id,
    expectedHash: review.hash,
    expectedRound: review.round,
    change,
  });

const prepareReview = async (
  client: WorkspaceClient,
  review: SavedReviewSchema & { activated?: boolean },
  command: ParsedCliCommand,
  openBrowser: (url: string) => Promise<unknown>,
) => {
  const { values } = command;
  const timeout = integerOption(values, "timeout", 600, 1, 3600);
  let grouping: ReviewJob | null = null;
  let analysis: ReviewJob | null = null;
  if (review.groupingEnabled && review.files.length) {
    const state = await client.request<{ jobs: ReviewJob[] }>(
      `/api/agents?snapshotId=${review.id}`,
    );
    grouping =
      state.jobs.find(
        (job) =>
          job.kind === "grouping" &&
          job.hash === review.hash &&
          (job.snapshotRound ?? 1) === (review.round ?? 1),
      ) ?? null;
    if (!grouping)
      throw new CliError(
        "Grouping could not be scheduled. Configure a grouping model and retry with groups run.",
        "grouping_unavailable",
        4,
        { reviewId: review.id },
      );
    if (values.wait) grouping = await waitForJob(client, grouping.id, timeout);
  }
  if (values["run-review"]) {
    analysis = await startJob(client, review.id, "review", {
      hash: review.hash,
      round: review.round,
      priority: stringOption(values, "priority") as
        "normal" | "high" | undefined,
    });
    if (values.wait) analysis = await waitForJob(client, analysis.id, timeout);
  }
  if (values.open || review.activated)
    await openBrowser(client.browserUrl(review.id));
  return {
    id: review.id,
    round: review.round,
    hash: review.hash,
    url: `${client.info().origin}/?review=${encodeURIComponent(review.id)}`,
    jobIds: [grouping?.id, analysis?.id].filter((id): id is string => !!id),
    review,
    preparation: { grouping, review: analysis },
  };
};

export const executeReviewCommand = async (
  client: WorkspaceClient,
  command: ParsedCliCommand,
  openBrowser: (url: string) => Promise<unknown> = open,
): Promise<unknown> => {
  const { name, args, values } = command;
  if (
    ["regions ", "brief ", "rules ", "source ", "quality "].some((prefix) =>
      name.startsWith(prefix),
    )
  )
    return executePrecisionCommand(client, command);
  if (
    [
      "findings ",
      "verifications ",
      "tasks ",
      "checks ",
      "rounds ",
      "usage ",
    ].some((prefix) => name.startsWith(prefix))
  )
    return executeWorkflowCommand(client, command);
  const id = args[0] ?? "current";
  const timeout = integerOption(values, "timeout", 600, 1, 3600);
  const grouping = values.group ? true : values["no-group"] ? false : undefined;
  if (name === "reviews list") {
    const search = encodeURIComponent(stringOption(values, "search") ?? "");
    return client.request(
      `/api/workspace?history=1&search=${search}&offset=${integerOption(values, "offset", 0)}&limit=${integerOption(values, "limit", 50, 1, 100)}`,
    );
  }
  if (name === "reviews create" || name === "inspect") {
    const source = sourceFromOptions({
      commit: stringOption(values, "commit"),
      range: stringOption(values, "range"),
      branch: stringOption(values, "branch"),
      base: stringOption(values, "base"),
      "working-tree": !!values["working-tree"],
    });
    let review = await client.request<
      SavedReviewSchema & { activated?: boolean }
    >("/api/workspace", {
      action: "inspect",
      source,
      ...(values.priority ? { priority: values.priority } : {}),
      activate: !!values.open,
      directory: client.info().directory ?? process.cwd(),
      ...(grouping === undefined ? {} : { grouping }),
    });
    const title = stringOption(values, "title");
    if (title)
      review = {
        ...(await changeReview(client, review, { action: "rename", title })),
        activated: review.activated,
      };
    return prepareReview(client, review, command, openBrowser);
  }
  if (name.startsWith("runs ")) {
    if (name === "runs list") {
      if (values.all) return client.request("/api/agents?queue=1");
      const review = await readReview(client, stringOption(values, "review"));
      return client.request(
        `/api/agents?snapshotId=${review.id}&history=jobs&offset=${integerOption(values, "offset", 0)}&limit=${integerOption(values, "limit", 50, 1, 100)}&search=${encodeURIComponent(stringOption(values, "search") ?? "")}`,
      );
    }
    if (name === "runs watch") return waitForJob(client, id, timeout);
    const job = await client.request<ReviewJob>(
      `/api/agents?jobId=${encodeURIComponent(id)}${name === "runs export" ? "&format=fix-prompts" : ""}`,
    );
    switch (name) {
      case "runs show":
        return job;
      case "runs cancel":
        if (job.status !== "queued" && job.status !== "running") return job;
        return client.request("/api/agents", { action: "cancel", id });
      case "runs retry": {
        const next = await client.request<ReviewJob>("/api/agents", {
          action: "retry",
          id: job.id,
        });
        return values.wait ? waitForJob(client, next.id, timeout) : next;
      }
      case "runs prioritize":
        return client.request("/api/agents", {
          action: "priority",
          id: job.id,
          priority: stringOption(values, "priority") ?? "high",
        });
      case "runs rename":
        return client.request("/api/agents", {
          action: "rename-review",
          id,
          title: args[1],
        });
      case "runs delete":
        await confirmDestructive(values, "Delete this saved AI review?");
        return client.request("/api/agents", { action: "delete-review", id });
      case "runs export": {
        if (
          job.kind !== "review" ||
          job.status !== "completed" ||
          !job.result?.findings
        )
          throw new CliError("Choose a completed correctness-review run.");
        if (values.json) return job;
        const finding = stringOption(values, "finding");
        if (finding) {
          const index =
            integerOption(values, "finding", 1, 1, job.result.findings.length) -
            1;
          return job.result.findings[index]!.fixPrompt;
        }
        return job.result.fixAllPrompt || "No fixes needed.";
      }
    }
  }
  const review = await readReview(client, id);
  const expectedHash = stringOption(values, "expected-hash");
  if (
    expectedHash &&
    (review.hash !== expectedHash ||
      review.round !== integerOption(values, "expected-round", 1, 1))
  )
    throw new CliError(
      "Review contents changed. Reload the review and retry with its current revision.",
      "review_conflict",
      6,
      { reviewId: review.id, hash: review.hash, round: review.round },
    );
  switch (name) {
    case "reviews show":
      return review;
    case "reviews files":
      return review.files.map((file) => ({
        path: file.path,
        oldPath: file.oldPath,
        status: file.status,
        binary: file.binary,
        added: file.added,
        deleted: file.deleted,
        beforeHash: file.beforeHash,
        afterHash: file.afterHash,
        completed: review.completedPaths.includes(file.path),
      }));
    case "reviews diff": {
      const path = stringOption(values, "file");
      const files = path
        ? review.files.filter((file) => file.path === path)
        : review.files;
      if (!files.length) throw new CliError("File not found in this snapshot.");
      const side = stringOption(values, "side");
      if (side && side !== "before" && side !== "after")
        throw new CliError(
          "--side must be before or after.",
          "invalid_arguments",
          2,
        );
      if (side && !path)
        throw new CliError(
          "Use --file when selecting a source side.",
          "invalid_arguments",
          2,
        );
      return files
        .map((file) =>
          side === "before"
            ? (file.before ?? "")
            : side === "after"
              ? (file.after ?? "")
              : file.diff,
        )
        .join("\n");
    }
    case "reviews open":
      await client.request("/api/workspace", { action: "open", id: review.id });
      await openBrowser(client.browserUrl(review.id));
      return {
        id: review.id,
        round: review.round,
        hash: review.hash,
        url: `${client.info().origin}/?review=${encodeURIComponent(review.id)}`,
      };
    case "reviews rename":
      return changeReview(client, review, {
        action: "rename",
        title: args[1]!,
      });
    case "reviews delete":
      await confirmDestructive(
        values,
        "Delete this review and all its saved data?",
      );
      await client.request("/api/workspace", {
        action: "delete",
        id: review.id,
        expectedHash: review.hash,
        expectedRound: review.round,
      });
      return { deleted: review.id };
    case "reviews sync": {
      const mode = stringOption(values, "mode") ?? "keep";
      if (mode !== "keep" && mode !== "new")
        throw new CliError(
          "--mode must be keep or new.",
          "invalid_arguments",
          2,
        );
      const updatedReview = await client.request<SavedReviewSchema>(
        "/api/workspace",
        {
          action: "resync",
          id: review.id,
          mode,
          ...(values.priority ? { priority: values.priority } : {}),
          expectedHash: review.hash,
          expectedRound: review.round,
          activate: !!values.open,
          directory: client.info().directory ?? process.cwd(),
          ...(grouping === undefined ? {} : { grouping }),
        },
      );
      return prepareReview(client, updatedReview, command, openBrowser);
    }
    case "reviews select": {
      const updatedReview = await changeReview(client, review, {
        action: "select",
        path: args[1]!,
      });
      await client.request("/api/workspace", { action: "open", id: review.id });
      if (values.open) await openBrowser(client.browserUrl(review.id, args[1]));
      return updatedReview;
    }
    case "reviews complete":
    case "reviews incomplete":
      return changeReview(client, review, {
        action: "complete",
        path: args[1]!,
        complete: name === "reviews complete",
      });
    case "reviews export":
      return { review, runs: await readAllJobs(client, review.id) };
    case "reviews run":
    case "groups run": {
      const job = await startJob(
        client,
        review.id,
        name === "groups run" ? "grouping" : "review",
        {
          hash: review.hash,
          round: review.round,
          priority: stringOption(values, "priority") as
            "normal" | "high" | undefined,
        },
      );
      return values.wait ? waitForJob(client, job.id, timeout) : job;
    }
    case "groups show": {
      const jobs = await readAllJobs(client, review.id);
      return (
        jobs.find(
          (job) =>
            job.kind === "grouping" &&
            job.hash === review.hash &&
            (job.snapshotRound ?? 1) === review.round,
        ) ?? null
      );
    }
    case "notes list": {
      const search = (stringOption(values, "search") ?? "").toLowerCase();
      const path = stringOption(values, "file");
      return review.notes.filter(
        (note) =>
          (!path || note.path === path) &&
          `${note.body}\n${note.path}\n${note.line?.code ?? ""}`
            .toLowerCase()
            .includes(search),
      );
    }
    case "notes add": {
      const path = args[1]!;
      const file = review.files.find((file) => file.path === path);
      if (!file) throw new CliError("File not found in this snapshot.");
      const side = stringOption(values, "side");
      if (side && side !== "before" && side !== "after")
        throw new CliError(
          "--side must be before or after.",
          "invalid_arguments",
          2,
        );
      if (!!side !== !!values.start || (values.end && !values.start))
        throw new CliError(
          "Line comments require both --side and --start.",
          "invalid_arguments",
          2,
        );
      const start = integerOption(values, "start", 1, 1);
      const end = integerOption(values, "end", start, start);
      const content =
        side === "before" ? file.before : side === "after" ? file.after : null;
      const lines = content?.split("\n");
      if (side && (!lines || end > lines.length))
        throw new CliError(
          "Comment lines are outside the frozen file.",
          "invalid_arguments",
          2,
        );
      return changeReview(client, review, {
        action: "add-note",
        note: {
          id: randomUUID(),
          previewId: review.id,
          path,
          body: await noteBody(values),
          line: side
            ? {
                side: side === "after" ? "additions" : "deletions",
                lineNumber: start,
                endLineNumber: end,
                code: lines!.slice(start - 1, end).join("\n"),
              }
            : null,
        },
      });
    }
    case "notes edit":
      return changeReview(client, review, {
        action: "edit-note",
        id: args[1]!,
        body: await noteBody(values),
      });
    case "notes delete":
      await confirmDestructive(values, "Delete this note?");
      return changeReview(client, review, {
        action: "delete-note",
        id: args[1]!,
      });
    default:
      throw new CliError(`Unsupported review operation: ${name}.`);
  }
};
