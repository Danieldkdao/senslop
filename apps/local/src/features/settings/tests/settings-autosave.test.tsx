// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSettingsAutosave } from "../hooks/use-settings-autosave";
import { SettingsSaveIndicator } from "../components/settings-save-indicator";
import { TooltipProvider } from "@/components/ui/tooltip";

const schema = z.object({
  name: z.string().min(2, "Enter at least two characters."),
});
const Harness = ({
  save,
  onFlushed,
}: {
  onFlushed?: () => void;
  save: (value: { name: string }) => Promise<unknown>;
}) => {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "Original" },
    mode: "onChange",
  });
  const autosave = useSettingsAutosave({ form, schema, save });
  return (
    <TooltipProvider>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void autosave.flush().then(onFlushed);
        }}
      >
        <input aria-label="Name" {...form.register("name")} />
      </form>
      <SettingsSaveIndicator />
      {form.formState.errors.name && (
        <p role="alert">{form.formState.errors.name.message}</p>
      )}
    </TooltipProvider>
  );
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("valid edits debounce automatically and saving status follows the real request", async () => {
  let finish: (() => void) | undefined;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness save={save} />);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "First" },
  });
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Latest" },
  });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Saving soon"),
  );
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith({ name: "Latest" });
  expect(screen.getByRole("status").textContent).toContain("Saving…");
  await act(async () => finish!());
  expect(screen.getByRole("status").textContent).toContain("All changes saved");
});

test("invalid values stay inline and never replace saved settings", async () => {
  const save = vi.fn(async () => {});
  render(<Harness save={save} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Check settings");
  await new Promise((resolve) => setTimeout(resolve, 550));
  expect(save).not.toHaveBeenCalled();
});

test("closing settings flushes the final edit after an in-flight save without overlapping writes", async () => {
  let finish: (() => void) | undefined;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const view = render(<Harness save={save} />);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "First" },
  });
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Last edit" },
  });
  view.unmount();
  expect(save).toHaveBeenCalledOnce();
  await act(async () => finish!());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenLastCalledWith({ name: "Last edit" });
});

test("failed saves remain visible and a later edit can recover", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("Disk unavailable"))
    .mockResolvedValue(undefined);
  render(<Harness save={save} />);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "First" },
  });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Couldn’t save"),
  );
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Recovered" },
  });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "All changes saved",
    ),
  );
});

test("reverting an edit before the debounce cancels the stale write", async () => {
  const save = vi.fn(async () => {});
  render(<Harness save={save} />);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Temporary" },
  });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Saving soon"),
  );
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Original" },
  });
  await new Promise((resolve) => setTimeout(resolve, 550));
  expect(save).not.toHaveBeenCalled();
});

test("reverting during a save queues the original value after the in-flight write", async () => {
  let finish: (() => void) | undefined;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  render(<Harness save={save} />);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Temporary" },
  });
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Original" },
  });
  await act(async () => finish!());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenLastCalledWith({ name: "Original" });
});

test("explicit flushing waits until all queued writes finish", async () => {
  const finish: (() => void)[] = [];
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish.push(resolve);
      }),
  );
  const onFlushed = vi.fn();
  render(<Harness save={save} onFlushed={onFlushed} />);
  const input = screen.getByLabelText("Name");
  fireEvent.change(input, { target: { value: "First" } });
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  fireEvent.change(input, { target: { value: "Second" } });
  fireEvent.submit(input.closest("form")!);
  await act(async () => finish[0]!());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(onFlushed).not.toHaveBeenCalled();
  await act(async () => finish[1]!());
  await waitFor(() => expect(onFlushed).toHaveBeenCalledOnce());
});

test("a new edit keeps its debounce window when the previous save finishes", async () => {
  vi.useFakeTimers();
  let finish: (() => void) | undefined;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  render(<Harness save={save} />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "First" },
    });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(save).toHaveBeenCalledOnce();
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Second" },
    });
  });
  await act(async () => finish!());
  expect(save).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(499);
  });
  expect(save).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith({ name: "Second" });
});
