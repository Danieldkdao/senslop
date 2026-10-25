import { expect, test } from "vitest";
import type { PreviewFileSchema } from "@senslop/contracts";
import { parsePreviewFile } from "../lib/parse-preview-file";

const file: PreviewFileSchema = {
  path: "sample.ts",
  oldPath: null,
  status: "M",
  before: "const value = 1;\n",
  after: "  const value = 1;  \n",
  beforeHash: null,
  afterHash: null,
  binary: false,
  added: 1,
  deleted: 1,
  diff: "",
};

test("whitespace display modes retain original coordinates and do not change frozen source", () => {
  const full = parsePreviewFile(file)!;
  expect(full.hunks.some((hunk) => hunk.additionLines > 0)).toBe(true);
  expect(
    parsePreviewFile(file, "ignore-all")?.hunks.some(
      (hunk) => hunk.additionLines > 0,
    ),
  ).toBe(false);
  expect(
    parsePreviewFile(file, "ignore-trailing")?.hunks.some(
      (hunk) => hunk.additionLines > 0,
    ),
  ).toBe(true);
  expect(file.after).toBe("  const value = 1;  \n");
  expect(
    parsePreviewFile(
      { ...file, after: "const value = 1;  \n" },
      "ignore-trailing",
    )?.hunks.some((hunk) => hunk.additionLines > 0),
  ).toBe(false);
});
