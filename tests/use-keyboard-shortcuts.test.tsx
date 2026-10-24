// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  useKeyboardShortcuts,
  type KeyboardShortcutOptions,
} from "../packages/ui/src/hooks/use-keyboard-shortcuts";

afterEach(cleanup);

const Harness = ({
  onFirst,
  onSecond,
  options,
}: {
  onFirst: () => void;
  onSecond: () => void;
  options?: KeyboardShortcutOptions;
}) => {
  useKeyboardShortcuts([
    { hotkey: "K", callback: onFirst },
    { hotkey: "D", callback: onSecond, options },
  ]);
  return <input aria-label="Text input" />;
};

test("per-hotkey options override shared defaults and callbacks stay current", () => {
  const first = vi.fn();
  const second = vi.fn();
  const latest = vi.fn();
  const view = render(
    <Harness onFirst={first} onSecond={second} options={{ enabled: false }} />,
  );
  fireEvent.keyDown(document, { key: "k" });
  fireEvent.keyDown(document, { key: "d" });
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  view.rerender(
    <Harness
      onFirst={latest}
      onSecond={second}
      options={{ enabled: true, ignoreInputs: false }}
    />,
  );
  fireEvent.keyDown(document, { key: "k" });
  fireEvent.keyDown(screen.getByLabelText("Text input"), { key: "d" });
  expect(latest).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  view.unmount();
  fireEvent.keyDown(document, { key: "k" });
  expect(latest).toHaveBeenCalledOnce();
});

test("typing, shadow inputs, overlays, composition and repeats keep their own keyboard events", () => {
  const action = vi.fn();
  render(<Harness onFirst={action} onSecond={vi.fn()} />);
  fireEvent.keyDown(screen.getByLabelText("Text input"), { key: "k" });
  const host = document.createElement("div");
  document.body.append(host);
  const input = document.createElement("input");
  host.attachShadow({ mode: "open" }).append(input);
  fireEvent.keyDown(input, { key: "k", composed: true });
  for (const role of ["dialog", "menu", "listbox"]) {
    host.setAttribute("role", role);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  host.remove();
  fireEvent.keyDown(document, { key: "k", isComposing: true });
  fireEvent.keyDown(document, { key: "k", repeat: true });
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  expect(action).not.toHaveBeenCalled();
});

test("individual hotkeys can allow repeats and overlays without preventing browser behavior", () => {
  const action = vi.fn();
  const view = render(
    <Harness
      onFirst={vi.fn()}
      onSecond={action}
      options={{
        allowRepeat: true,
        allowInOverlays: true,
        preventDefault: false,
      }}
    />,
  );
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  document.body.append(overlay);
  const event = new KeyboardEvent("keydown", {
    key: "d",
    repeat: true,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  expect(action).toHaveBeenCalledOnce();
  expect(event.defaultPrevented).toBe(false);
  overlay.remove();
  view.unmount();
});

test("async shortcut callbacks receive a signal that aborts on unmount", () => {
  let signal: AbortSignal | undefined;
  const AsyncShortcut = () => {
    useKeyboardShortcuts([
      {
        hotkey: "R",
        callback: (_event, context) => {
          signal = context.signal;
        },
      },
    ]);
    return null;
  };
  const view = render(<AsyncShortcut />);
  fireEvent.keyDown(document, { key: "r" });
  expect(signal?.aborted).toBe(false);
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

test("native ignoreInputs options protect editing and allow explicit input shortcuts", () => {
  const action = vi.fn();
  const InputShortcut = ({
    ignoreInputs = true,
  }: {
    ignoreInputs?: KeyboardShortcutOptions["ignoreInputs"];
  }) => {
    useKeyboardShortcuts([
      {
        hotkey: "Control+B",
        callback: action,
        options: { ignoreInputs },
      },
    ]);
    return (
      <>
        <input aria-label="Input" />
        <textarea aria-label="Textarea" />
        <select aria-label="Select" />
        <div contentEditable aria-label="Editor" />
      </>
    );
  };
  const view = render(<InputShortcut />);
  const editor = screen.getByLabelText("Editor");
  // JSDOM does not implement the browser's isContentEditable property.
  Object.defineProperty(editor, "isContentEditable", { value: true });
  for (const label of ["Input", "Textarea", "Select", "Editor"]) {
    const event = new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    screen.getByLabelText(label).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(action).not.toHaveBeenCalled();
  view.rerender(<InputShortcut ignoreInputs="auto" />);
  fireEvent.keyDown(screen.getByLabelText("Input"), {
    key: "b",
    ctrlKey: true,
  });
  expect(action).toHaveBeenCalledOnce();
});
