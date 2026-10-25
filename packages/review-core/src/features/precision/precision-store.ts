import { z } from "zod";
import {
  organizationSchema,
  unitGroupsSchema,
  type SavedReviewSchema,
  type OrganizationSchema,
  type OrganizationActionSchema,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { WorkflowStore } from "../workflow/workflow-store";
import {
  createReviewUnits,
  reconcileOrganization,
  unitDigest,
  validateOrganization,
} from "./review-units";

const legacyGroupingSchema = z.object({
  groups: z.array(
    z.object({
      title: z.string(),
      rationale: z.string(),
      files: z.array(z.object({ path: z.string() })),
    }),
  ),
  unitGroups: unitGroupsSchema.shape.flows.optional(),
});
export type LegacyGroupingSchema = z.infer<typeof legacyGroupingSchema>;

export class PrecisionStore {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
  ) {}

  organization = (identity: ReviewIdentitySchema): OrganizationSchema =>
    this.store.transaction(() => {
      const review = new WorkflowStore(
        this.store,
        this.repository,
      ).requireReview(identity.id, identity);
      const existingOrganization = this.store.database
        .prepare(
          "SELECT body FROM review_precision WHERE review_id=? AND round=?",
        )
        .get(review.id, review.round);
      if (existingOrganization) {
        const organization = organizationSchema.parse(
          JSON.parse(String(existingOrganization.body)),
        );
        if (
          !organization.manual &&
          organization.flows.length === 1 &&
          organization.flows[0]?.rationale ===
            "Read changed regions and their supporting context."
        )
          this.restoreLegacyFlows(review, organization);
        return organization;
      }
      const previousOrganization = this.store.database
        .prepare(
          "SELECT body FROM review_precision WHERE review_id=? AND round<? ORDER BY round DESC LIMIT 1",
        )
        .get(review.id, review.round);
      const organization = reconcileOrganization(
        createReviewUnits(review.files),
        previousOrganization
          ? organizationSchema.parse(
              JSON.parse(String(previousOrganization.body)),
            )
          : undefined,
      );
      if (!previousOrganization)
        for (const unit of organization.units)
          unit.reviewed = review.completedPaths.includes(unit.path);
      this.restoreLegacyFlows(review, organization);
      this.save(review, organization);
      this.syncCompletion(review, organization);
      return organization;
    });

  private restoreLegacyFlows = (
    review: SavedReviewSchema,
    organization: OrganizationSchema,
  ) => {
    if (review.groupingEnabled === false || organization.manual) return;
    const row = this.store.database
      .prepare(
        "SELECT body FROM ai_jobs WHERE snapshot_id=? AND json_extract(body,'$.kind')='grouping' AND json_extract(body,'$.status')='completed' AND json_extract(body,'$.hash')=? AND coalesce(json_extract(body,'$.snapshotRound'),1)=? ORDER BY rowid DESC LIMIT 1",
      )
      .get(review.id, review.hash, review.round);
    if (!row) return;
    const parsed = legacyGroupingSchema.safeParse(
      (JSON.parse(String(row.body)) as { result?: unknown }).result,
    );
    if (!parsed.success) return;
    const flows =
      parsed.data.unitGroups ??
      parsed.data.groups.map((group) => ({
        title: group.title,
        rationale: group.rationale,
        unitIds: organization.units
          .filter((unit) => group.files.some((file) => file.path === unit.path))
          .map((unit) => unit.id),
      }));
    const next = {
      ...organization,
      flows: flows
        .filter((flow) => flow.unitIds.length)
        .map((flow, index) => ({
          ...flow,
          id: unitDigest([flow.title, index]),
        })),
    };
    try {
      validateOrganization(next);
    } catch {
      return;
    }
    if (JSON.stringify(organization.flows) === JSON.stringify(next.flows))
      return;
    organization.flows = next.flows;
    organization.version++;
    this.save(review, organization);
  };

  save = (identity: ReviewIdentitySchema, organization: OrganizationSchema) => {
    validateOrganization(organization);
    this.store.database
      .prepare(
        "INSERT INTO review_precision VALUES (?,?,?) ON CONFLICT(review_id,round) DO UPDATE SET body=excluded.body",
      )
      .run(identity.id, identity.round, JSON.stringify(organization));
  };

  private syncCompletion = (
    identity: ReviewIdentitySchema,
    organization: OrganizationSchema,
  ) => {
    const review = new WorkflowStore(this.store, this.repository).requireReview(
      identity.id,
      identity,
    );
    for (const path of new Set(organization.units.map((item) => item.path))) {
      const reviewed = organization.units
        .filter((item) => item.path === path)
        .every((item) => item.reviewed);
      if (review.completedPaths.includes(path) !== reviewed)
        this.store.changeReview(
          this.repository,
          identity.id,
          {
            action: "complete",
            path,
            complete: reviewed,
          },
          undefined,
          { preserveUnitCompletion: true },
        );
    }
  };

  applyGrouping = (
    identity: ReviewIdentitySchema,
    groups: { title: string; rationale: string; files: { path: string }[] }[],
    unitGroups?: { title: string; rationale: string; unitIds: string[] }[],
    replaceManual = false,
  ) =>
    this.store.transaction(() => {
      const organization = this.organization(identity);
      if (organization.manual && !replaceManual) return organization;
      const flows =
        unitGroups ??
        groups.map((group) => ({
          title: group.title,
          rationale: group.rationale,
          unitIds: organization.units
            .filter((unit) =>
              group.files.some((file) => file.path === unit.path),
            )
            .map((unit) => unit.id),
        }));
      organization.flows = flows
        .filter((flow) => flow.unitIds.length)
        .map((flow, index) => ({
          ...flow,
          id: unitDigest([flow.title, index]),
        }));
      organization.version++;
      organization.manual = false;
      this.save(identity, organization);
      return organization;
    });

  changeOrganization = (
    identity: ReviewIdentitySchema,
    version: number,
    operation: OrganizationActionSchema,
  ) =>
    this.store.transaction(() => {
      let organization = this.organization(identity);
      if (organization.version !== version)
        throw new Error("Review organization changed. Reload before editing.");
      const unit =
        "unitId" in operation
          ? organization.units.find((item) => item.id === operation.unitId)
          : undefined;
      const flow =
        "flowId" in operation
          ? organization.flows.find((item) => item.id === operation.flowId)
          : undefined;
      if (("unitId" in operation && !unit) || ("flowId" in operation && !flow))
        throw new Error("Review region or flow not found.");
      switch (operation.action) {
        case "reset-organization": {
          const previous = organization;
          const snapshot = new WorkflowStore(
            this.store,
            this.repository,
          ).requireReview(identity.id, identity);
          organization = reconcileOrganization(
            createReviewUnits(snapshot.files),
            { ...previous, manual: false, flows: [] },
          );
          organization.version = previous.version;
          for (const current of organization.units) {
            if (!current.ranges.length) continue;
            current.reviewed = current.ranges.every((range) =>
              Array.from(
                { length: range.end - range.start + 1 },
                (_, offset) => range.start + offset,
              ).every((line) =>
                previous.units.some(
                  (old) =>
                    old.path === current.path &&
                    old.reviewed &&
                    old.ranges.some(
                      (owned) =>
                        owned.side === range.side &&
                        owned.start <= line &&
                        owned.end >= line,
                    ),
                ),
              ),
            );
          }
          break;
        }
        case "create-flow": {
          const ids = new Set(operation.unitIds);
          if (
            ids.size !== operation.unitIds.length ||
            operation.unitIds.some(
              (id) => !organization.units.some((item) => item.id === id),
            )
          )
            throw new Error("Choose existing regions once.");
          for (const item of organization.flows)
            item.unitIds = item.unitIds.filter((id) => !ids.has(id));
          organization.flows.push({
            id: unitDigest([
              operation.title,
              operation.unitIds,
              organization.version,
            ]),
            title: operation.title,
            rationale: "Manually organized",
            unitIds: operation.unitIds,
          });
          break;
        }
        case "complete-unit":
          unit!.reviewed = operation.reviewed;
          unit!.needsReview = false;
          break;
        case "complete-file": {
          const units = organization.units.filter(
            (item) => item.path === operation.path,
          );
          if (!units.length) throw new Error("File not found.");
          for (const item of units) {
            item.reviewed = operation.reviewed;
            item.needsReview = false;
          }
          break;
        }
        case "rename-flow":
          flow!.title = operation.title;
          break;
        case "move-flow": {
          const index = organization.flows.indexOf(flow!);
          const target = Math.min(
            organization.flows.length - 1,
            Math.max(0, index + operation.direction),
          );
          organization.flows.splice(index, 1);
          organization.flows.splice(target, 0, flow!);
          break;
        }
        case "move-unit": {
          for (const item of organization.flows)
            item.unitIds = item.unitIds.filter((id) => id !== operation.unitId);
          flow!.unitIds.splice(operation.index, 0, operation.unitId);
          break;
        }
        case "split-unit": {
          const range = unit!.ranges.find(
            (item) =>
              item.side === operation.side &&
              operation.line > item.start &&
              operation.line <= item.end,
          );
          if (!range)
            throw new Error("Choose a split within a changed region.");
          const lines = range.code.split("\n");
          const offset = operation.line - range.start;
          const secondRange = {
            ...range,
            start: operation.line,
            code: lines.slice(offset).join("\n"),
          };
          range.end = operation.line - 1;
          range.code = lines.slice(0, offset).join("\n");
          unit!.fingerprint = unitDigest(
            unit!.ranges.map(({ side, code }) => ({ side, code })),
          );
          unit!.reviewed = false;
          const second = {
            ...unit!,
            id: unitDigest([unit!.id, operation.side, operation.line]),
            label: `Lines ${secondRange.start}–${secondRange.end}`,
            fingerprint: unitDigest([
              { side: secondRange.side, code: secondRange.code },
            ]),
            ranges: [secondRange],
          };
          organization.units.splice(
            organization.units.indexOf(unit!) + 1,
            0,
            second,
          );
          const parent = organization.flows.find((item) =>
            item.unitIds.includes(unit!.id),
          )!;
          parent.unitIds.splice(
            parent.unitIds.indexOf(unit!.id) + 1,
            0,
            second.id,
          );
          break;
        }
        case "combine-units": {
          const selected = organization.units.filter((item) =>
            operation.unitIds.includes(item.id),
          );
          if (
            selected.length !== new Set(operation.unitIds).size ||
            new Set(selected.map((item) => item.path)).size !== 1
          )
            throw new Error("Combine regions in the same file.");
          const first = selected[0]!;
          const combined = {
            ...first,
            id: unitDigest(selected.map((item) => item.id)),
            ranges: selected.flatMap((item) => item.ranges),
            fingerprint: unitDigest(
              selected
                .flatMap((item) => item.ranges)
                .map(({ side, code }) => ({ side, code })),
            ),
            reviewed: selected.every((item) => item.reviewed),
          };
          const parent = organization.flows.find((item) =>
            item.unitIds.includes(first.id),
          )!;
          const index = parent.unitIds.indexOf(first.id);
          for (const item of organization.flows)
            item.unitIds = item.unitIds.filter(
              (id) => !operation.unitIds.includes(id),
            );
          parent.unitIds.splice(index, 0, combined.id);
          organization.units = organization.units.filter(
            (item) => !operation.unitIds.includes(item.id),
          );
          organization.units.push(combined);
          break;
        }
        case "combine-flows": {
          const selected = organization.flows.filter((item) =>
            operation.flowIds.includes(item.id),
          );
          if (selected.length !== new Set(operation.flowIds).size)
            throw new Error("Flow not found.");
          selected[0]!.unitIds = selected.flatMap((item) => item.unitIds);
          organization.flows = organization.flows.filter(
            (item) =>
              !operation.flowIds.includes(item.id) || item === selected[0],
          );
          break;
        }
      }
      organization.flows = organization.flows.filter(
        (item) => item.unitIds.length,
      );
      if (
        !operation.action.startsWith("complete-") &&
        operation.action !== "reset-organization"
      )
        organization.manual = true;
      organization.version++;
      this.save(identity, organization);
      this.syncCompletion(identity, organization);
      return organization;
    });
}
