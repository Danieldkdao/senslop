import { test, expect } from "vitest";
import { PresenceRegistry, type PresenceSocket } from "../src/presence";

const observer = () => {
  const events: Array<{
    type: string;
    devices?: Array<{
      id: string;
    }>;
  }> = [];
  const closed: number[] = [];
  const socket: PresenceSocket = {
    send: (data) => events.push(JSON.parse(data)),
    close: (code) => closed.push(code ?? 0),
  };
  return { socket, events, closed };
};

test("presence is account scoped and duplicate sockets do not disconnect an online device", () => {
  const registry = new PresenceRegistry();
  const a = observer();
  const b = observer();
  const cli = observer();
  registry.add(a.socket, { userId: "a", sessionId: "browser-a" });
  registry.add(b.socket, { userId: "b", sessionId: "browser-b" });
  const one = registry.add(cli.socket, {
    userId: "a",
    sessionId: "cli-a",
    deviceId: "device-a",
  });
  const two = registry.add(cli.socket, {
    userId: "a",
    sessionId: "cli-a",
    deviceId: "device-a",
  });
  expect(a.events.filter((e) => e.type === "cli.connected").length).toBe(1);
  expect(b.events.flatMap((e) => e.devices ?? []).length).toBe(0);
  one();
  expect(registry.devices("a").length).toBe(1);
  two();
  expect(registry.devices("a").length).toBe(0);
  expect(a.events.filter((e) => e.type === "cli.disconnected").length).toBe(1);
});

test("logout disconnects only matching session sockets", () => {
  const registry = new PresenceRegistry();
  const revoked = observer();
  const retained = observer();
  registry.add(revoked.socket, {
    userId: "a",
    sessionId: "revoked",
    deviceId: "revoked",
  });
  registry.add(retained.socket, {
    userId: "a",
    sessionId: "retained",
    deviceId: "retained",
  });
  registry.disconnectSession("revoked");
  expect(revoked.closed).toEqual([4001]);
  expect(retained.closed).toEqual([]);
});
