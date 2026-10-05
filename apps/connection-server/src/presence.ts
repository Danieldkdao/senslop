import type { PresenceEventSchema } from "@senslop/contracts";

export type Identity = {
  userId: string;
  sessionId: string;
  deviceId?: string;
  name?: string;
};

export type PresenceSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type Connection = {
  socket: PresenceSocket;
  identity: Identity;
  connectedAt: string;
};

// Membership is ephemeral: a database row is never treated as connected.
export class PresenceRegistry {
  private connections = new Set<Connection>();

  add(socket: PresenceSocket, identity: Identity) {
    const previous = this.devices(identity.userId).some(
      (d) => d.id === identity.deviceId,
    );
    const connection = {
      socket,
      identity,
      connectedAt: new Date().toISOString(),
    };
    this.connections.add(connection);
    if (identity.deviceId && !previous)
      this.broadcast(identity.userId, {
        type: "cli.connected",
        deviceId: identity.deviceId,
        timestamp: connection.connectedAt,
      });
    this.snapshot(identity.userId);
    return () => {
      if (!this.connections.delete(connection)) return;
      if (
        identity.deviceId &&
        !this.devices(identity.userId).some((d) => d.id === identity.deviceId)
      ) {
        this.broadcast(identity.userId, {
          type: "cli.disconnected",
          deviceId: identity.deviceId,
          timestamp: new Date().toISOString(),
        });
      }
      this.snapshot(identity.userId);
    };
  }

  devices(userId: string) {
    const devices = new Map<
      string,
      {
        id: string;
        name: string;
        connectedAt: string;
      }
    >();
    for (const { identity, connectedAt } of this.connections) {
      if (
        identity.userId === userId &&
        identity.deviceId &&
        !devices.has(identity.deviceId)
      ) {
        devices.set(identity.deviceId, {
          id: identity.deviceId,
          name: identity.name ?? "Senslop CLI",
          connectedAt,
        });
      }
    }
    return [...devices.values()];
  }

  disconnectSession(sessionId: string) {
    for (const connection of this.connections)
      if (connection.identity.sessionId === sessionId)
        connection.socket.close(4001, "Session revoked");
  }

  private snapshot(userId: string) {
    this.broadcast(userId, {
      type: "presence.snapshot",
      devices: this.devices(userId),
    });
  }

  private broadcast(userId: string, event: PresenceEventSchema) {
    for (const { identity, socket } of this.connections)
      if (identity.userId === userId && !identity.deviceId)
        socket.send(JSON.stringify(event));
  }
}
