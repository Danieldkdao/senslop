import express, { type Express, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { applyPatch, parsePatch } from "diff";
import { WebSocket } from "ws";
import {
  MAX_FILE_BYTES,
  MAX_SNAPSHOT_BYTES,
  previewUploadSchema,
  type PreviewEventSchema,
  type PreviewUploadSchema,
} from "@senslop/contracts";
import type { Identity, PresenceRegistry } from "../../presence";
import type { PresenceDependencies } from "../../server";

type PreviewResponse = Response<
  unknown,
  {
    previewIdentity: Identity;
    previewDelivering?: boolean;
    releasePreviewLock: () => void;
  }
>;

const validContents = (preview: PreviewUploadSchema) => {
  const paths = new Set<string>();
  for (const file of preview.files) {
    if (paths.has(file.path) || file.path.includes("\0")) return false;
    paths.add(file.path);
    if (file.binary) {
      if (
        file.before !== null ||
        file.after !== null ||
        file.added !== 0 ||
        file.deleted !== 0
      )
        return false;
      continue;
    }
    if (file.before === null && file.after === null) return false;
    for (const [text, hash] of [
      [file.before, file.beforeHash],
      [file.after, file.afterHash],
    ] as const) {
      if (
        text === null
          ? hash !== null
          : Buffer.byteLength(text) > MAX_FILE_BYTES ||
            createHash("sha256").update(text).digest("hex") !== hash
      )
        return false;
    }
    try {
      const patches = parsePatch(file.diff);
      if (patches.length !== 1) return false;
      let added = 0;
      let deleted = 0;
      for (const hunk of patches[0]!.hunks)
        for (const line of hunk.lines) {
          if (line.startsWith("+")) added++;
          if (line.startsWith("-")) deleted++;
        }
      if (
        added !== file.added ||
        deleted !== file.deleted ||
        applyPatch(file.before ?? "", patches[0]!) !== (file.after ?? "")
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
};

const sendEvent = (socket: WebSocket, event: PreviewEventSchema) =>
  new Promise<void>((resolve, reject) => {
    if (
      socket.readyState !== WebSocket.OPEN ||
      socket.bufferedAmount > MAX_SNAPSHOT_BYTES
    ) {
      reject(
        new Error(
          "Browser connection is unavailable. Reopen the dashboard and preview again.",
        ),
      );
      return;
    }
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("Browser connection timed out. Preview again."));
    }, 10000);
    socket.send(JSON.stringify(event), (error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    });
  });

export const mountPreviewRoutes = (
  app: Express,
  registry: PresenceRegistry,
  dependencies: PresenceDependencies,
) => {
  const busyUsers = new Set<string>();
  app.post(
    "/preview",
    async (request, response: PreviewResponse, next) => {
      try {
        const header = request.get("authorization");
        const identity =
          header?.startsWith("Bearer ") && !request.get("origin")
            ? await dependencies.authenticateCLI(header.slice(7))
            : null;
        if (response.destroyed) return;
        if (!identity?.deviceId) {
          response
            .status(401)
            .json({ message: "Sign in with the CLI before previewing." });
          return;
        }
        if (
          !registry
            .devices(identity.userId)
            .some((device) => device.id === identity.deviceId)
        ) {
          response.status(409).json({
            message: "Keep senslop connect running in another terminal.",
          });
          return;
        }
        if (busyUsers.has(identity.userId)) {
          response.status(409).json({
            message: "Another preview is being sent. Wait for it to finish.",
          });
          return;
        }
        response.locals.previewIdentity = identity;
        busyUsers.add(identity.userId);
        let lockHeld = true;
        response.locals.releasePreviewLock = () => {
          if (!lockHeld) return;
          lockHeld = false;
          busyUsers.delete(identity.userId);
        };
        // Body parsing may close early; active delivery owns the lock until its finally block.
        response.once("close", () => {
          if (!response.locals.previewDelivering)
            response.locals.releasePreviewLock();
        });
        next();
      } catch {
        response
          .status(503)
          .json({ message: "Account service unavailable. Please retry." });
      }
    },
    express.json({ limit: MAX_SNAPSHOT_BYTES, inflate: false }),
    async (request, response: PreviewResponse) => {
      const identity = response.locals.previewIdentity;
      response.locals.previewDelivering = true;
      const previewId = randomUUID();
      let clients: WebSocket[] = [];
      let started = false;
      try {
        if (response.destroyed) return;
        const preview = previewUploadSchema.safeParse(request.body);
        if (!preview.success || !validContents(preview.data)) {
          response.status(400).json({
            message: "Invalid snapshot contents, hashes or patch coordinates.",
          });
          return;
        }
        // Authentication is checked again after receiving the body, before any source is relayed.
        const currentIdentity = await dependencies.authenticateCLI(
          request.get("authorization")!.slice(7),
        );
        if (response.destroyed) return;
        if (
          !currentIdentity ||
          currentIdentity.userId !== identity.userId ||
          currentIdentity.sessionId !== identity.sessionId ||
          currentIdentity.deviceId !== identity.deviceId
        ) {
          response
            .status(401)
            .json({ message: "CLI session expired. Sign in again." });
          return;
        }
        if (
          !registry
            .devices(identity.userId)
            .some((device) => device.id === identity.deviceId)
        ) {
          response.status(409).json({
            message: "Keep senslop connect running in another terminal.",
          });
          return;
        }
        const browsers = registry.browsers(identity.userId);
        for (const browser of browsers) {
          const valid = await dependencies.validBrowserSession(
            browser.identity,
          );
          if (response.destroyed) return;
          if (valid) clients.push(browser.socket as WebSocket);
        }
        if (!clients.length) {
          response.status(409).json({
            message:
              "Open your Senslop dashboard signed in to the same account as the CLI before inspecting.",
          });
          return;
        }
        const broadcast = async (event: PreviewEventSchema) => {
          if (response.destroyed)
            throw new Error("CLI disconnected during preview. Send it again.");
          if (event.type === "preview.start") started = true;
          const outcomes = await Promise.allSettled(
            clients.map((socket) => sendEvent(socket, event)),
          );
          clients = clients.filter(
            (_socket, index) => outcomes[index]?.status === "fulfilled",
          );
          if (!clients.length)
            throw new Error(
              "Browser disconnected during preview. Open the dashboard and send it again.",
            );
        };
        await broadcast({
          type: "preview.start",
          previewId,
          source: preview.data.source,
          fileCount: preview.data.files.length,
          excluded: preview.data.excluded,
        });
        for (const [index, file] of preview.data.files.entries()) {
          await broadcast({ type: "preview.file", previewId, index, file });
        }
        await broadcast({ type: "preview.complete", previewId });
        if (!response.destroyed)
          response.json({ previewId, fileCount: preview.data.files.length });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Preview delivery failed. Please retry.";
        if (started)
          await Promise.allSettled(
            clients.map((socket) =>
              sendEvent(socket, { type: "preview.failed", previewId, message }),
            ),
          );
        if (!response.destroyed) response.status(503).json({ message });
      } finally {
        response.locals.releasePreviewLock();
      }
    },
  );
};
