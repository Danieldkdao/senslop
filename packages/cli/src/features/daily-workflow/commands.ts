import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderReportHtml } from "@senslop/review-core/reports";
import { z } from "zod";
import {
  gitStateSchema,
  memoryActionSchema,
  reviewReportSchema,
} from "@senslop/contracts";
import type { ParsedCliCommand } from "../commands/types.js";
import type { WorkspaceClient } from "../workspace/workspace-client.js";
import {
  confirmDestructive,
  readTextInput,
  stringOption,
  integerOption,
} from "../commands/input.js";
import { readReview } from "../reviews/requests.js";

export const executeDailyCommand = async (
  client: WorkspaceClient,
  command: ParsedCliCommand,
) => {
  const { name, values, args } = command;
  if (name === "memory list") return client.request("/api/project-memory");
  if (name === "memory apply")
    return client.request(
      "/api/project-memory",
      memoryActionSchema.parse(
        JSON.parse(await readTextInput(stringOption(values, "file") ?? "-")),
      ),
    );
  if (name === "reports list") {
    const review = await readReview(client, args[0]);
    return client.request(`/api/reports?reviewId=${review.id}`);
  }
  if (name === "reports generate") {
    const review = await readReview(client, args[0]);
    return client.request("/api/reports", {
      reviewId: review.id,
      round: integerOption(values, "round", review.round, 1),
      includeSource: !!values["include-source"],
    });
  }
  if (name === "reports export") {
    const report = reviewReportSchema.parse(
      await client.request(
        `/api/reports?id=${z.uuid().parse(args[0])}&source=${!!values["include-source"]}`,
      ),
    );
    const format = z
      .enum(["html", "json"])
      .parse(stringOption(values, "format") ?? "html");
    const output = stringOption(values, "output");
    if (!output) throw new Error("Choose an export file with --output.");
    const path = resolve(output);
    await writeFile(
      path,
      format === "html"
        ? renderReportHtml(report)
        : JSON.stringify(report, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    return { path, format, reportId: report.id };
  }
  if (name === "reports show")
    return client.request(
      `/api/reports?id=${z.uuid().parse(args[0])}&source=${!!values["include-source"]}`,
    );
  if (name === "about") return client.request("/api/about");
  const state = gitStateSchema.parse(await client.request("/api/git"));
  if (name === "git conflict")
    return client.request(
      `/api/git?${new URLSearchParams({ conflict: args[0]! })}`,
    );
  if (name === "git abort-merge") {
    await confirmDestructive(
      values,
      "Abort the current merge and discard its conflict resolutions?",
    );
    return client.request("/api/git", {
      action: "abort-merge",
      expected: state.identity,
    });
  }
  if (name === "git status") return state;
  if (name === "git diff")
    return client.request(
      `/api/git?${new URLSearchParams({ path: args[0]!, staged: String(!!values.staged) })}`,
    );
  const expected = stringOption(values, "expected-state") ?? state.identity;
  const remote = stringOption(values, "remote") ?? state.remotes[0]?.name ?? "";
  const branch = stringOption(values, "branch") ?? state.branch;
  if (name === "git outgoing")
    return client.request(
      `/api/git?${new URLSearchParams({ remote, branch })}`,
    );
  if (["git commit", "git push", "git pull"].includes(name))
    await confirmDestructive(
      values,
      `${name.slice(4)} ${name === "git commit" ? "the complete staged changes" : `${remote}/${branch}`}?`,
    );
  if (name === "git stage" || name === "git unstage")
    return client.request("/api/git", {
      action: name === "git stage" ? "stage" : "unstage",
      path: args[0],
      expected,
      ...(values.hunk !== undefined
        ? { hunk: integerOption(values, "hunk", 0) }
        : {}),
    });
  if (name === "git commit")
    return client.request("/api/git", {
      action: "commit",
      subject: stringOption(values, "subject") ?? "",
      body: stringOption(values, "body") ?? "",
      expected,
    });
  if (name === "git fetch")
    return client.request("/api/git", { action: "fetch", remote, expected });
  const outgoing =
    name === "git push"
      ? await client.request<{ identity: string }>(
          `/api/git?${new URLSearchParams({ remote, branch })}`,
        )
      : null;
  return client.request("/api/git", {
    expectedOutgoing: outgoing?.identity,
    action: name === "git pull" ? "pull" : "push",
    remote,
    branch,
    expected,
    overrideReason: stringOption(values, "reason"),
  });
};
