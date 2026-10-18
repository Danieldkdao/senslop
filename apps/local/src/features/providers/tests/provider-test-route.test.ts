import { afterEach, expect, test, vi } from "vitest";
import { POST } from "../../../app/api/providers/route";

const state = vi.hoisted(() => ({
  resolve: vi.fn(),
  probe: vi.fn(),
  models: vi.fn(),
}));
vi.mock("../../../features/workspace/lib/server-workspace", () => ({
  getWorkspace: () => ({ store: {} }),
  protectLocalRoute: () => true,
  readLocalBody: (request: Request) => request.json(),
  localWorkspaceError: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("../../../features/providers/lib/provider-service", () => ({
  ProviderService: class {
    resolve = state.resolve;
    probe = state.probe;
  },
}));
vi.mock("../../../services/credentials/os-credentials", () => ({
  osCredentials: {},
}));
vi.mock("../../../services/subscriptions/server-subscriptions", () => ({
  getSubscriptionService: () => ({ models: state.models }),
}));

afterEach(() => vi.resetAllMocks());

const id = "00000000-0000-4000-8000-000000000001";
const request = (action: "test" | "models") =>
  new Request("http://localhost/api/providers", {
    method: "POST",
    body: JSON.stringify({ action, id }),
  });

test.each(["chatgpt-subscription", "claude-code"])(
  "%s metadata checks use the subscription service instead of probing serialized credentials",
  async (provider) => {
    state.resolve.mockResolvedValue({
      connection: { provider },
      secret: '{"subscription":true}',
    });
    state.probe.mockRejectedValue(
      new Error("Provider rejected the credentials."),
    );
    state.models.mockResolvedValue({
      models: [{ id: "subscription-model", name: "Subscription model" }],
      source: "live",
      manualAllowed: false,
      message: null,
    });
    for (const action of ["test", "models"] as const) {
      const incoming = request(action);
      const response = await POST(incoming);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        supported: true,
        models: ["subscription-model"],
      });
      expect(state.models).toHaveBeenLastCalledWith(id, incoming.signal);
    }
    expect(state.probe).not.toHaveBeenCalled();
  },
);

test("API-key connections retain their existing metadata probe", async () => {
  state.resolve.mockResolvedValue({ connection: { provider: "chatgpt" } });
  const result = {
    supported: true,
    models: ["api-model"],
    message: "Metadata received.",
  };
  state.probe.mockResolvedValue(result);
  const response = await POST(request("test"));
  expect(await response.json()).toEqual(result);
  expect(state.probe).toHaveBeenCalledExactlyOnceWith(id, "test");
  expect(state.models).not.toHaveBeenCalled();
});
