// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useReadingTrail } from "../hooks/use-reading-trail";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

test("investigation history restores source side, region and reading position while discarding forward branches", () => {
  const { result } = renderHook(() => useReadingTrail("review:hash:1"));
  act(() =>
    result.current.visit({ path: "a.ts", side: "after", unitId: "first" }, 0),
  );
  act(() =>
    result.current.visit(
      { path: "helper.ts", side: "before", start: 20, end: 24 },
      450,
    ),
  );
  let previous;
  act(() => {
    previous = result.current.go(-1, 700);
  });
  expect(previous).toEqual(
    expect.objectContaining({ path: "a.ts", unitId: "first", scrollTop: 450 }),
  );
  act(() => result.current.visit({ path: "different.ts", side: "after" }, 460));
  expect(result.current.canForward).toBe(false);
  expect(result.current.canBack).toBe(true);
});

test("different review revisions cannot reuse another revision's navigation", () => {
  const { result, rerender } = renderHook(({ key }) => useReadingTrail(key), {
    initialProps: { key: "first" },
  });
  act(() => result.current.visit({ path: "a.ts", side: "after" }, 0));
  act(() => result.current.visit({ path: "helper.ts", side: "after" }, 100));
  rerender({ key: "second" });
  expect(result.current.canBack).toBe(false);
});

test("reopening the same tab restores its existing trail without overwriting storage", () => {
  const first = renderHook(() => useReadingTrail("persisted"));
  act(() => first.result.current.visit({ path: "a.ts", side: "after" }, 0));
  act(() =>
    first.result.current.visit(
      { path: "helper.ts", side: "before", context: true },
      123,
    ),
  );
  first.unmount();
  const second = renderHook(() => useReadingTrail("persisted"));
  expect(second.result.current.current?.path).toBe("helper.ts");
  expect(second.result.current.canBack).toBe(true);
  expect(
    JSON.parse(sessionStorage.getItem("senslop:trail:persisted")!).entries,
  ).toHaveLength(2);
});

test("return to review skips supporting-source visits and restores the region position", () => {
  const { result } = renderHook(() => useReadingTrail("return"));
  act(() =>
    result.current.visit(
      { path: "change.ts", side: "after", unitId: "region" },
      0,
    ),
  );
  act(() =>
    result.current.visit(
      { path: "helper.ts", side: "after", context: true },
      456,
    ),
  );
  act(() =>
    result.current.visit(
      { path: "another.ts", side: "before", context: true },
      100,
    ),
  );
  let location;
  act(() => {
    location = result.current.returnToReview(200);
  });
  expect(location).toEqual(
    expect.objectContaining({
      path: "change.ts",
      unitId: "region",
      scrollTop: 456,
    }),
  );
  expect(result.current.canForward).toBe(true);
});
