import { expect, test } from "vitest";
import { formatEditorUri } from "../lib/formatters";
test.each([
  [
    "/Users/person/my repo",
    "src/a #1.ts",
    "vscode://file/Users/person/my%20repo/src/a%20%231.ts",
  ],
  ["C:\\my repo", "src/a #1.ts", "vscode://file/C:/my%20repo/src/a%20%231.ts"],
  ["D:/repo/", "file.ts", "vscode://file/D:/repo/file.ts"],
  [
    "\\\\server\\share\\repo",
    "file.ts",
    "vscode://file//server/share/repo/file.ts",
  ],
  ["/", "file.ts", "vscode://file/file.ts"],
])("editor links normalize %s", (directory, path, expected) => {
  expect(formatEditorUri(directory, path)).toBe(expected);
});
