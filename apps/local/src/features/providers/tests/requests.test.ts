import { afterEach, expect, test, vi } from "vitest";
import { providerRequest, readProviderSettings } from "../lib/requests";

afterEach(() => vi.unstubAllGlobals());

test.each(["http", "fetch", "json", "validation"])(
  "provider reads return null on %s failures",
  async (failure) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (failure === "fetch") throw new Error("Offline");
        return {
          ok: failure !== "http",
          json: async () => {
            if (failure === "json") throw new Error("Invalid JSON");
            return { message: "Unavailable" };
          },
        };
      }),
    );
    await expect(readProviderSettings()).resolves.toBeNull();
  },
);

test("provider reads return empty collections and mutation failures still throw", async () => {
  const settings = { connections: [], defaultId: null, cleanupPending: false };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => settings,
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "OS credential store locked." }),
      }),
  );
  await expect(readProviderSettings()).resolves.toEqual(settings);
  await expect(providerRequest({ action: "save" })).rejects.toThrow(
    "OS credential store locked.",
  );
});
