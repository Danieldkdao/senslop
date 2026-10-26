// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { useFormDraft } from "../hooks/use-form-draft";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
test("a draft survives unmount and is removed after successful submission", () => {
  const render = () =>
    renderHook(() => {
      const form = useForm({ defaultValues: { body: "" } });
      const draft = useFormDraft(form, "note:one");
      return { form, draft };
    });
  const first = render();
  act(() => first.result.current.form.setValue("body", "Keep this note"));
  first.unmount();
  const second = render();
  expect(second.result.current.form.getValues().body).toBe("Keep this note");
  act(() => second.result.current.draft.clear());
  second.unmount();
  const third = render();
  expect(third.result.current.form.getValues().body).toBe("");
});

test("a tab keeps its own draft when another tab updates the restart backup", () => {
  const render = () =>
    renderHook(() => {
      const form = useForm({ defaultValues: { body: "" } });
      const draft = useFormDraft(form, "note:tab");
      return { form, draft };
    });
  const first = render();
  act(() => first.result.current.form.setValue("body", "First tab"));
  first.unmount();
  localStorage.setItem(
    "senslop:draft:note:tab",
    JSON.stringify({ values: { body: "Other tab" }, updatedAt: Date.now() }),
  );
  expect(render().result.current.form.getValues().body).toBe("First tab");
});
