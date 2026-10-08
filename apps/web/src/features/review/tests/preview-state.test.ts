import { expect, test } from "vitest";
import { reducePreview } from "../lib/preview-state";
import type { PreviewEventSchema } from "@senslop/contracts";

const previewId = "b7abed53-2d2b-489d-8cd6-fc4721b8d404";
const start: PreviewEventSchema = {
  type: "preview.start",
  previewId,
  fileCount: 2,
  source: {
    kind: "working-tree",
    base: "a".repeat(40),
    head: null,
    firstParent: false,
  },
  excluded: [],
};
const file: PreviewEventSchema = {
  type: "preview.file",
  previewId,
  index: 0,
  file: {
    path: "first.ts",
    oldPath: null,
    status: "A",
    binary: false,
    before: null,
    after: "hello\n",
    beforeHash: null,
    afterHash: "a".repeat(64),
    added: 1,
    deleted: 0,
    diff: "patch",
  },
};

test("files progressively appear without accepting stale or out-of-order events", () => {
  const receiving = reducePreview(null, start);
  expect(receiving?.status).toBe("receiving");
  expect(reducePreview(receiving, { ...file, previewId: "other" })).toBe(
    receiving,
  );
  const first = reducePreview(receiving, file);
  expect(first?.files.map((file) => file.path)).toEqual(["first.ts"]);
  expect(reducePreview(first, file)?.status).toBe("failed");
  expect(
    reducePreview(first, { type: "preview.complete", previewId })?.status,
  ).toBe("failed");
  const second = reducePreview(first, {
    ...file,
    index: 1,
    file: { ...file.file, path: "second.ts" },
  });
  expect(
    reducePreview(second, { type: "preview.complete", previewId })?.status,
  ).toBe("ready");
});

test("a new preview replaces the previous one while failure preserves received files", () => {
  const first = reducePreview(reducePreview(null, start), file);
  const failed = reducePreview(first, {
    type: "preview.failed",
    previewId,
    message: "Disconnected",
  });
  expect(failed?.files).toHaveLength(1);
  expect(failed?.error).toBe("Disconnected");
  expect(reducePreview(failed, { ...start, previewId: "new" })?.files).toEqual(
    [],
  );
});
