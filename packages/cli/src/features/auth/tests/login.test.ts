import { beforeEach, expect, test, vi } from "vitest";

const progress = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  error: vi.fn(),
  cancel: vi.fn(),
  open: vi.fn(),
  warn: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
  requestJSON: vi.fn(),
  saveCredentials: vi.fn(),
  readCredentials: vi.fn(),
  sleep: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  open: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  spinner: () => progress,
  note: mocks.note,
  cancel: mocks.cancel,
  log: { success: vi.fn(), warn: mocks.warn },
}));
vi.mock("open", () => ({ default: mocks.open }));
vi.mock("node:timers/promises", () => ({ setTimeout: mocks.sleep }));
vi.mock("../../../lib/http.js", () => ({ requestJSON: mocks.requestJSON }));
vi.mock("../credentials.js", () => ({
  readCredentials: mocks.readCredentials,
  saveCredentials: mocks.saveCredentials,
}));

import { login } from "../login.js";

const codes = {
  device_code: "device-code",
  user_code: "ABCD-EFGH",
  verification_uri: "http://localhost:3000/device",
  expires_in: 600,
  interval: 5,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readCredentials.mockResolvedValue(null);
  mocks.sleep.mockResolvedValue(undefined);
  mocks.open.mockResolvedValue(undefined);
});

test("device login displays the code and saves only an approved credential", async () => {
  mocks.requestJSON
    .mockResolvedValueOnce(codes)
    .mockRejectedValueOnce(
      Object.assign(new Error("pending"), { code: "authorization_pending" }),
    )
    .mockResolvedValueOnce({ access_token: "approved-token" });
  await expect(login("http://localhost:3000")).resolves.toBe(true);
  expect(mocks.note).toHaveBeenCalledWith(
    expect.stringContaining("ABCD-EFGH"),
    "Approve this device",
  );
  expect(progress.start).toHaveBeenCalledWith("Waiting for browser approval…");
  expect(mocks.saveCredentials).toHaveBeenCalledExactlyOnceWith({
    baseURL: "http://localhost:3000",
    token: "approved-token",
  });
  expect(progress.stop).toHaveBeenCalledExactlyOnceWith("Device approved.");
});

test("denial stops the spinner and never saves credentials", async () => {
  const signals = process.listenerCount("SIGINT");
  mocks.requestJSON
    .mockResolvedValueOnce(codes)
    .mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "access_denied" }),
    );
  await expect(login("http://localhost:3000")).rejects.toThrow("denied");
  expect(progress.error).toHaveBeenCalledExactlyOnceWith(
    "Sign-in did not complete.",
  );
  expect(mocks.saveCredentials).not.toHaveBeenCalled();
  expect(process.listenerCount("SIGINT")).toBe(signals);
});

test("interrupting browser approval cancels before requesting or saving a token", async () => {
  const signals = process.listenerCount("SIGINT");
  mocks.requestJSON.mockResolvedValueOnce(codes);
  mocks.sleep.mockImplementationOnce(async () => {
    process.emit("SIGINT");
    throw Object.assign(new Error("cancelled"), { name: "AbortError" });
  });
  await expect(login("http://localhost:3000")).resolves.toBe(false);
  expect(mocks.requestJSON).toHaveBeenCalledOnce();
  expect(mocks.saveCredentials).not.toHaveBeenCalled();
  expect(mocks.cancel).toHaveBeenCalledWith(
    "Sign-in cancelled. No credential saved.",
  );
  expect(process.listenerCount("SIGINT")).toBe(signals);
});

test("device login uses the manual-entry URL even when a prefilled URL exists", async () => {
  mocks.requestJSON
    .mockResolvedValueOnce({
      ...codes,
      verification_uri_complete:
        "http://localhost:3000/device?user_code=ABCD-EFGH",
    })
    .mockResolvedValueOnce({ access_token: "approved-token" });
  await login("http://localhost:3000");
  const message = mocks.note.mock.calls[0][0] as string;
  expect(message).toContain(
    "Open http://localhost:3000/device in your browser.",
  );
  expect(message).toContain("Enter this code from your terminal: ABCD-EFGH");
  expect(message).not.toContain("user_code=");
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith(
    "http://localhost:3000/device",
  );
});

test("browser-opening failure keeps the printed URL and approval polling usable", async () => {
  mocks.open.mockRejectedValueOnce(new Error("No browser available"));
  mocks.requestJSON
    .mockResolvedValueOnce(codes)
    .mockResolvedValueOnce({ access_token: "approved-token" });
  await expect(login("http://localhost:3000")).resolves.toBe(true);
  expect(mocks.warn).toHaveBeenCalledWith(
    "Could not open your browser. Open the URL above to continue.",
  );
  expect(mocks.note.mock.calls[0][0]).toContain("http://localhost:3000/device");
  expect(mocks.saveCredentials).toHaveBeenCalledOnce();
});

test("a foreign verification URL is rejected before opening a browser", async () => {
  mocks.requestJSON.mockResolvedValueOnce({
    ...codes,
    verification_uri: "https://outside.example/device",
  });
  await expect(login("http://localhost:3000")).rejects.toThrow(
    "Verification URL must be on the Senslop website.",
  );
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.saveCredentials).not.toHaveBeenCalled();
});
