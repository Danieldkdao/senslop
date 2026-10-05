import type { DeviceSchema } from "@senslop/contracts";
export type ConnectionState = {
  status: "connecting" | "live" | "retrying";
  devices: DeviceSchema[];
};
