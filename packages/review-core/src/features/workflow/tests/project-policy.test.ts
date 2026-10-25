import { expect, test } from "vitest";
import { projectPolicySchema } from "@senslop/contracts";
import { allowsSourcePath, assertInferenceRoute } from "../project-policy";
test("exclusions override inclusions and cannot be bypassed with traversal or credential paths", () => {
  const policy = projectPolicySchema.parse({
    include: ["src/**"],
    exclude: ["src/private/**"],
  });
  expect(allowsSourcePath(policy, "src/index.ts")).toBe(true);
  expect(allowsSourcePath(policy, "src/private/key.ts")).toBe(false);
  expect(allowsSourcePath(policy, "src/../secret.ts")).toBe(false);
  expect(allowsSourcePath(policy, "src/.env")).toBe(false);
  expect(allowsSourcePath(policy, "test/index.ts")).toBe(false);
});
test("local-only policy blocks a local brand with a remote endpoint and every remote fallback", () => {
  const policy = projectPolicySchema.parse({ inference: "local-only" });
  expect(() =>
    assertInferenceRoute(policy, {
      provider: "ollama",
      baseURL: "https://remote.example",
    }),
  ).toThrow(/local/);
  expect(() =>
    assertInferenceRoute(policy, {
      provider: "openai",
      baseURL: "https://api.openai.com",
    }),
  ).toThrow(/local/);
  expect(() =>
    assertInferenceRoute(policy, {
      provider: "ollama",
      baseURL: "http://127.0.0.1:11434",
    }),
  ).not.toThrow();
});
