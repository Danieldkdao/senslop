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
import { ProjectMemorySettings } from "../components/project-memory-settings";
import { TooltipProvider } from "@/components/ui/tooltip";

const fixture = vi.hoisted(() => ({
  act: vi.fn(),
  entry: {
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    text: "Initial guidance",
    paths: ["**"],
    assumption: "",
    enabled: true,
    review: {
      id: "22222222-2222-4222-8222-222222222222",
      round: 1,
      hash: "a".repeat(64),
    },
    originKind: "review",
    originId: null,
    history: [],
  },
}));
vi.mock("../hooks/use-project-memory", () => ({
  useProjectMemory: () => ({
    state: { data: [fixture.entry] },
    act: fixture.act,
    pending: false,
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("queued guidance saves use the returned version after settings unmount", async () => {
  let finish!: (value: unknown) => void;
  fixture.act
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({
      ...fixture.entry,
      version: 3,
      createdAt: new Date().toISOString(),
    });
  const view = render(
    <TooltipProvider>
      <ProjectMemorySettings />
    </TooltipProvider>,
  );
  fireEvent.change(screen.getByLabelText("Guidance"), {
    target: { value: "First edit" },
  });
  await waitFor(() => expect(fixture.act).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Guidance"), {
    target: { value: "Latest edit" },
  });
  view.unmount();
  await act(async () =>
    finish({
      ...fixture.entry,
      text: "First edit",
      version: 2,
      createdAt: new Date().toISOString(),
    }),
  );
  await waitFor(() => expect(fixture.act).toHaveBeenCalledTimes(2));
  expect(fixture.act.mock.calls[1]?.[0]).toMatchObject({
    version: 2,
    guidance: { text: "Latest edit" },
  });
});
