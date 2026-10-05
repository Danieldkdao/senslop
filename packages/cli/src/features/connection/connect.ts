import WebSocket from "ws";
import { log } from "@clack/prompts";
import { setTimeout as sleep } from "node:timers/promises";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  presenceEventSchema,
  cliStatusSchema,
} from "@senslop/contracts";
import { requireCredentials } from "../auth/credentials.js";
import { requestJSON, validatedSocketURL } from "../../lib/http.js";

export const connect = async () => {
  const credentials = await requireCredentials();
  const abort = new AbortController();
  let socket: WebSocket | undefined;
  const stop = () => {
    abort.abort();
    socket?.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let failures = 0;
  try {
    while (!abort.signal.aborted) {
      let status;
      try {
        status = cliStatusSchema.parse(
          await requestJSON<unknown>(
            credentials.baseURL,
            "/api/cli/status",
            {},
            credentials.token,
          ),
        );
      } catch (error) {
        const failure = error as Error & {
          status?: number;
        };
        if (failure.status === 401 || failure.status === 403) throw failure;
        log.warn("Account service unavailable. Retrying connection…");
        await sleep(Math.min(1000 * 2 ** failures++, 30000), undefined, {
          signal: abort.signal,
        }).catch((error) => {
          if (error.name !== "AbortError") throw error;
        });
        continue;
      }
      if (abort.signal.aborted) break;
      await new Promise<void>((resolve, reject) => {
        socket = new WebSocket(validatedSocketURL(status.connectionUrl), {
          headers: { Authorization: `Bearer ${credentials.token}` },
          handshakeTimeout: 10000,
        });
        let heartbeat: NodeJS.Timeout | undefined;
        let lastMessage = Date.now();
        socket.on("open", () => {
          failures = 0;
          log.info(
            `Connected as ${status.user.name}. Keep this terminal open; Ctrl+C disconnects.`,
          );
          heartbeat = setInterval(() => {
            if (Date.now() - lastMessage > HEARTBEAT_TIMEOUT_MS) {
              socket?.terminate();
              return;
            }
            // ws automatically replies to server pings; detect stalled peers here.
          }, HEARTBEAT_INTERVAL_MS);
        });
        socket.on("message", (value) => {
          lastMessage = Date.now();
          try {
            const event = presenceEventSchema.safeParse(
              JSON.parse(value.toString()),
            );
            if (
              event.success &&
              event.data.type === "cli.disconnected" &&
              event.data.deviceId === status.deviceId
            )
              log.info("Your CLI disconnected.");
          } catch {
            /* Ignore non-protocol messages; heartbeat watchdog still applies. */
          }
        });
        socket.on("ping", () => {
          lastMessage = Date.now();
        });
        socket.on("error", () => {
          log.warn("Connection interrupted. Retrying…");
        });
        socket.on("close", (code) => {
          if (heartbeat) clearInterval(heartbeat);
          if (code === 4001 || code === 1008)
            reject(
              new Error(
                "CLI credential expired or revoked. Run senslop login again.",
              ),
            );
          else resolve();
        });
      });
      if (!abort.signal.aborted)
        await sleep(Math.min(1000 * 2 ** failures++, 30000), undefined, {
          signal: abort.signal,
        }).catch((error) => {
          if (error.name !== "AbortError") throw error;
        });
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    socket?.close();
  }
};
