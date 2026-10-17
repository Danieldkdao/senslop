// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWorkspaceUpdates } from "../hooks/use-workspace-updates";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("external changes invalidate only the affected UI resources", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let revisions = { workspace: "1", settings: "1", providers: "1" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(revisions)),
  );
  const invalidate = vi.spyOn(client, "invalidateQueries");
  renderHook(useWorkspaceUpdates, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() =>
    expect(client.getQueryData(["workspace-updates"])).toEqual(revisions),
  );
  revisions = { ...revisions, settings: "2" };
  await client.refetchQueries({ queryKey: ["workspace-updates"] });
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ai-settings"] }),
  );
  expect(invalidate).not.toHaveBeenCalledWith({
    queryKey: ["provider-settings"],
  });
  revisions = { ...revisions, providers: "2", workspace: "2" };
  await client.refetchQueries({ queryKey: ["workspace-updates"] });
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["provider-settings"],
    }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["review-history"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["agent-history"] });
  client.clear();
});
