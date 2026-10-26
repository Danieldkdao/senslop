import { expect, test } from "vitest";
import { analyzeSources } from "../source-analysis";

test("source analysis leaves the request thread responsive while compiling frozen files", async () => {
  const sources = Object.fromEntries(
    Array.from({ length: 80 }, (_, index) => [
      `source-${index}.ts`,
      Array.from(
        { length: 50 },
        (_, item) => `export const value${item}: number = ${item};`,
      ).join("\n"),
    ]),
  );
  const started = performance.now();
  const analysis = analyzeSources(sources, ["source-0.ts"]);
  const dispatchMs = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 10));
  const heartbeatMs = performance.now() - started;
  const result = await analysis;
  expect(result.symbols.length).toBeGreaterThan(0);
  expect(dispatchMs).toBeLessThan(100);
  expect(heartbeatMs).toBeLessThan(250);
});

test("identical concurrent source requests share their analysis and failed inputs remain retryable", async () => {
  const sources = { "value.ts": "export const value = 1;" };
  const first = analyzeSources(sources, ["value.ts"]);
  const second = analyzeSources(sources, ["value.ts"]);
  expect(first).toBe(second);
  await first;
  await expect(
    analyzeSources({ "../unsafe.ts": "secret" }, []),
  ).rejects.toThrow("Invalid frozen source path");
  await expect(analyzeSources(sources, ["value.ts"])).resolves.toHaveProperty(
    "symbols",
  );
});
