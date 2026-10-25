import {
  organizationActionSchema,
  reviewBriefInputSchema,
  reviewRulesPatchSchema,
  sourceSides,
  type OrganizationSchema,
  type ReviewBriefSchema,
} from "@senslop/contracts";
import type { ParsedCliCommand } from "../commands/types.js";
import type { WorkspaceClient } from "../workspace/workspace-client.js";
import { readReview } from "../reviews/requests.js";
import { CliError } from "../commands/errors.js";
import {
  confirmDestructive,
  integerOption,
  readTextInput,
  stringOption,
} from "../commands/input.js";

export const executePrecisionCommand = async (
  client: WorkspaceClient,
  command: ParsedCliCommand,
): Promise<unknown> => {
  const { name, args, values } = command;
  if (name === "quality list") return client.request("/api/review-quality");
  if (name === "quality show") {
    const runs = await client.request<{ id: string }[]>("/api/review-quality");
    const run = runs.find((item) => item.id === args[0]);
    if (!run) throw new CliError("Quality report not found.", "not_found", 5);
    return run;
  }
  if (name === "quality run") {
    if (values.live)
      await confirmDestructive(
        values,
        "Run the synthetic corpus against your Review model? Provider charges may apply.",
      );
    return client.request("/api/review-quality", {
      mode: values.live ? "live" : "deterministic",
      allowLive: !!values.live,
    });
  }
  const saved = await readReview(client, args[0]);
  const hash = stringOption(values, "expected-hash");
  if (
    (hash && hash !== saved.hash) ||
    (values["expected-round"] !== undefined &&
      integerOption(values, "expected-round", 1, 1) !== saved.round)
  )
    throw new CliError(
      "Review contents changed. Reload and reassess.",
      "review_conflict",
      6,
    );
  const review = { id: saved.id, hash: saved.hash, round: saved.round };
  const params = new URLSearchParams({
    reviewId: saved.id,
    hash: saved.hash,
    round: String(saved.round),
  });
  const input = async () => {
    const file = stringOption(values, "file");
    if (!file)
      throw new CliError(
        "Use --file with a JSON input document, or - for stdin.",
        "invalid_arguments",
        2,
      );
    return JSON.parse(await readTextInput(file)) as unknown;
  };
  if (name === "regions list")
    return client.request(`/api/precision?${params}`);
  if (name === "regions update") {
    const operation = organizationActionSchema.parse(await input());
    if (operation.action === "reset-organization")
      await confirmDestructive(values, "Reset manual review organization?");
    const organization = await client.request<OrganizationSchema>(
      `/api/precision?${params}`,
    );
    const version = integerOption(
      values,
      "organization-version",
      organization.version,
    );
    return client.request("/api/precision", { review, version, operation });
  }
  if (name === "brief show" || name === "rules show")
    return client.request(`/api/review-intent?reviewId=${saved.id}`);
  if (name === "brief set") {
    const brief = reviewBriefInputSchema.parse(await input());
    const state = await client.request<{ briefs: ReviewBriefSchema[] }>(
      `/api/review-intent?reviewId=${saved.id}`,
    );
    const version = integerOption(
      values,
      "brief-version",
      state.briefs[0]?.version ?? 0,
    );
    return client.request("/api/review-intent", {
      review,
      operation: { action: "save-brief", version, brief },
    });
  }
  if (name === "rules set") {
    const scope = stringOption(values, "scope") ?? "review";
    if (scope !== "project" && scope !== "review")
      throw new CliError(
        "Rules scope must be project or review.",
        "invalid_arguments",
        2,
      );
    return client.request("/api/review-intent", {
      review,
      operation: {
        action: "save-rules",
        scope,
        rules: reviewRulesPatchSchema.parse(await input()),
      },
    });
  }
  if (name.startsWith("source ")) {
    const side = stringOption(values, "side") ?? "after";
    if (!sourceSides.some((candidate) => candidate === side))
      throw new CliError(
        "Source side must be before or after.",
        "invalid_arguments",
        2,
      );
    params.set("side", side);
    if (name === "source show") params.set("path", args[1]!);
    if (name === "source search") {
      const query = stringOption(values, "search");
      if (!query)
        throw new CliError(
          "Use --search with source text.",
          "invalid_arguments",
          2,
        );
      params.set("query", query);
    }
    return client.request(`/api/source-explorer?${params}`);
  }
  throw new CliError("Unknown precision operation.", "invalid_arguments", 2);
};
