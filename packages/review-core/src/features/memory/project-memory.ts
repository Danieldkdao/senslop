import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  memoryGuidanceSchema,
  projectMemorySchema,
  type MemoryGuidanceSchema,
  type MemoryOriginKind,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import {
  projectPreferenceKey,
  readProjectPolicy,
  allowsSourcePath,
} from "../workflow/project-policy";
import { WorkflowStore } from "../workflow/workflow-store";

export class ProjectMemory {
  constructor(
    private store: LocalStore,
    private repository: string,
  ) {}

  private key = () =>
    projectPreferenceKey(this.store, this.repository, "project_memory");

  list = () => {
    const row = this.store.database
      .prepare("SELECT value FROM preferences WHERE name=?")
      .get(this.key());
    return z
      .array(projectMemorySchema)
      .parse(row ? JSON.parse(String(row.value)) : []);
  };

  private save = (entries: ReturnType<ProjectMemory["list"]>) => {
    this.store.database
      .prepare(
        "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(this.key(), JSON.stringify(entries));
  };

  create = (
    input: Omit<MemoryGuidanceSchema, "enabled"> & {
      enabled?: boolean;
      review: ReviewIdentitySchema;
      originKind: MemoryOriginKind;
      originId: string | null;
    },
  ) =>
    this.store.transaction(() => {
      const workflow = new WorkflowStore(this.store, this.repository);
      const review = workflow.requireReview(input.review.id, input.review);
      const policy = readProjectPolicy(this.store, this.repository);
      if (input.originKind === "finding") {
        const finding = workflow
          .findings(review.id)
          .find((entry) => entry.id === input.originId);
        if (!finding || finding.decision === "open")
          throw new Error("Record a finding decision before remembering it.");
        if (
          !finding.observations.every((entry) =>
            allowsSourcePath(policy, entry.evidence.path),
          )
        )
          throw new Error("Finding evidence is excluded by source policy.");
      }
      if (input.originKind === "note") {
        const note = review.notes.find((entry) => entry.id === input.originId);
        if (!note || !allowsSourcePath(policy, note.path))
          throw new Error("Note is unavailable under source policy.");
      }
      const guidance = memoryGuidanceSchema.parse(input);
      const now = new Date().toISOString();
      const entry = projectMemorySchema.parse({
        ...guidance,
        id: randomUUID(),
        version: 1,
        review: input.review,
        originKind: input.originKind,
        originId: input.originId,
        createdAt: now,
        history: [{ ...guidance, updatedAt: now }],
      });
      this.save([...this.list(), entry]);
      return entry;
    });

  update = (id: string, version: number, input: MemoryGuidanceSchema) =>
    this.store.transaction(() => {
      const entries = this.list();
      const existingMemory = entries.find((entry) => entry.id === id);
      if (!existingMemory || existingMemory.version !== version)
        throw new Error("Project memory changed. Reload before editing.");
      const guidance = memoryGuidanceSchema.parse(input);
      const updatedMemory = {
        ...existingMemory,
        ...guidance,
        version: version + 1,
        history: [
          ...existingMemory.history,
          { ...guidance, updatedAt: new Date().toISOString() },
        ],
      };
      this.save(
        entries.map((entry) => (entry.id === id ? updatedMemory : entry)),
      );
      return updatedMemory;
    });

  remove = (id: string, version: number) =>
    this.store.transaction(() => {
      const entries = this.list();
      if (
        !entries.some((entry) => entry.id === id && entry.version === version)
      )
        throw new Error("Project memory changed. Reload before removing.");
      this.save(entries.filter((entry) => entry.id !== id));
    });
}
