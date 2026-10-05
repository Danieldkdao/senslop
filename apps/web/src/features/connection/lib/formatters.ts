import type { ConnectionState } from "../types";

export const formatConnectionStatus = (state: ConnectionState) => {
  switch (state.status) {
    case "live":
      return state.devices.length ? "CLI connected" : "Ready to connect";
    case "connecting":
      return "Checking connection";
    case "retrying":
      return "Reconnecting";
  }
};

export const formatFirstName = (name: string) =>
  name.trim().split(/\s+/)[0] || "friend";
