// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { useSavedState } from "../hooks/use-saved-state";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});
const Harness = () => {
  const [focused] = useSavedState("focused-reading", false);
  return <main>{focused ? "Focused" : "Panels"}</main>;
};
test("persisted view state hydrates without replacing the server content", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Harness />);
  document.body.appendChild(container);
  const serverNode = container.firstChild;
  sessionStorage.setItem("senslop:view:focused-reading", "true");
  const errors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, <Harness />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });
  expect(errors).toEqual([]);
  expect(container.firstChild).toBe(serverNode);
  expect(container.textContent).toBe("Focused");
  await act(async () => root.unmount());
  container.remove();
});
test("switching storage keys restores each view without overwriting saved values", () => {
  localStorage.setItem("senslop:view:first", '"one"');
  localStorage.setItem("senslop:view:second", '"two"');
  const view = renderHook(({ name }) => useSavedState(name, "fallback"), {
    initialProps: { name: "first" },
  });
  expect(view.result.current[0]).toBe("one");
  view.rerender({ name: "second" });
  expect(view.result.current[0]).toBe("two");
  act(() => view.result.current[1]((value) => value + " updated"));
  expect(JSON.parse(localStorage.getItem("senslop:view:second")!)).toBe(
    "two updated",
  );
  expect(JSON.parse(localStorage.getItem("senslop:view:first")!)).toBe("one");
});
