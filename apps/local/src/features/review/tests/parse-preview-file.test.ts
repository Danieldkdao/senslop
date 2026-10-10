import { expect, test } from "vitest";
import type { PreviewFileSchema } from "@senslop/contracts";
import { parsePreviewFile } from "../lib/parse-preview-file";

const file: PreviewFileSchema = {
  path: 'quoted "雪".ts',
  oldPath: 'quoted "雪".ts',
  status: "M",
  before: "old\n",
  after: "new\n",
  beforeHash: "a".repeat(64),
  afterHash: "b".repeat(64),
  binary: false,
  added: 1,
  deleted: 1,
  diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n",
};

test("Pierre parses patches while preserving exact filenames and source lines", () => {
  const parsed = parsePreviewFile(file);
  expect(parsed?.name).toBe(file.path);
  expect(parsed?.deletionLines.join("")).toBe(file.before);
  expect(parsed?.additionLines.join("")).toBe(file.after);
});

test("missing patch metadata is reconstructed from frozen contents, including empty additions", () => {
  const parsed = parsePreviewFile({ ...file, diff: "unrecognized patch" });
  expect(parsed?.deletionLines.join("")).toBe(file.before);
  expect(parsed?.additionLines.join("")).toBe(file.after);
  expect(
    parsePreviewFile({
      ...file,
      status: "A",
      oldPath: null,
      before: null,
      after: "",
      diff: "",
    })?.type,
  ).toBe("new");
});

test("binary files and unchanged renames do not require a text diff", () => {
  expect(parsePreviewFile({ ...file, binary: true })).toBeNull();
  expect(
    parsePreviewFile({ ...file, status: "R100", after: file.before }),
  ).toBeNull();
});

test("partial Git hunks retain full source for syntax grammar context", () => {
  const before = ":root {\n  --one: red;\n  --primary: red;\n}\n";
  const after = before.replace("--primary: red", "--primary: green");
  const parsed = parsePreviewFile({
    ...file,
    path: "theme.css",
    oldPath: null,
    before,
    after,
    diff: "--- a/theme.css\n+++ b/theme.css\n@@ -3,1 +3,1 @@\n-  --primary: red;\n+  --primary: green;\n",
  });
  expect(parsed?.isPartial).toBe(false);
  expect(parsed?.deletionLines.join("")).toBe(before);
  expect(parsed?.additionLines.join("")).toBe(after);
  expect(parsed?.hunks[0]?.additionStart).toBe(3);
});
