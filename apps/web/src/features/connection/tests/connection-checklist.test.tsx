// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConnectionChecklist } from "../components/connection-checklist";
import type { ConnectionState } from "../types";

const state = vi.hoisted(() => ({
  presence: { status: "connecting", devices: [] } as ConnectionState,
}));
vi.mock("../hooks/use-presence", () => ({ usePresence: () => state.presence }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

beforeEach(() => {
  state.presence = { status: "connecting", devices: [] };
});
afterEach(cleanup);

test.each(["connecting", "live"] as const)(
  "%s without a CLI shows the setup steps inside the canvas",
  (status) => {
    state.presence.status = status;
    render(<ConnectionChecklist name="Daniel Dao" />);
    expect(
      screen.getByRole("heading", { name: "Connect your CLI" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Build the local CLI" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Approve this computer" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Keep a connection open" }),
    ).toBeTruthy();
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  },
);

test("a live CLI shows the honest no-upload state and the available inspection command", () => {
  state.presence = {
    status: "live",
    devices: [
      {
        id: "device-a",
        name: "Daniel’s CLI",
        connectedAt: "2026-10-05T00:00:00.000Z",
      },
    ],
  };
  render(<ConnectionChecklist name="Daniel Dao" />);
  expect(
    screen.getByRole("heading", { name: "Ready for your first review" }),
  ).toBeTruthy();
  expect(screen.getByText(/No review has been submitted/)).toBeTruthy();
  expect(
    screen.getByText("node packages/cli/dist/index.js inspect --working-tree"),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Build the local CLI" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: /Upload/ })).toBeNull();
});

test("losing connection restores the setup view without pretending files were uploaded", () => {
  state.presence = {
    status: "live",
    devices: [
      { id: "device-a", name: "CLI", connectedAt: "2026-10-05T00:00:00.000Z" },
    ],
  };
  const view = render(<ConnectionChecklist name="Daniel" />);
  state.presence = { status: "retrying", devices: [] };
  view.rerender(<ConnectionChecklist name="Daniel" />);
  expect(screen.getByText("Reconnecting")).toBeTruthy();
  expect(screen.getByText(/retrying automatically/)).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Connect your CLI" }),
  ).toBeTruthy();
});
