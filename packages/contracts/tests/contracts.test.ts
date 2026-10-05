import { test, expect } from "vitest";
import { eligibility, secureBaseURL } from "../src/index.js";
test("eligibility includes small files but does not count them toward five", () => {
  const qualifying = Array.from({ length: 5 }, () => ({
    binary: false,
    additions: 6,
    deletions: 4,
  }));
  expect(eligibility(qualifying).eligible).toBe(true);
  expect(
    eligibility([
      ...qualifying.slice(1),
      { binary: false, additions: 2, deletions: 0 },
    ]).eligible,
  ).toBe(false);
  expect(
    eligibility([...qualifying, { binary: false, additions: 2, deletions: 0 }])
      .qualifyingFiles,
  ).toBe(5);
  expect(eligibility([]).eligible).toBe(false);
  expect(
    eligibility(qualifying.map((f) => ({ ...f, binary: true }))).eligible,
  ).toBe(false);
});
test("remote credentials may only go to HTTPS origins", () => {
  expect(secureBaseURL("http://localhost:3000")).toBe("http://localhost:3000");
  expect(secureBaseURL("https://senslop.example/")).toBe(
    "https://senslop.example",
  );
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com/?key=x",
  ])
    expect(() => secureBaseURL(url)).toThrow();
});
