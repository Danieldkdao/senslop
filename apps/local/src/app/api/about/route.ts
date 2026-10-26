import { z } from "zod";
import localPackage from "../../../../package.json";
import { cachedRelease, assertUpdateIdle } from "@senslop/review-core/updates";
import { gitProcess } from "@senslop/review-core/git-process";
import { recordNotification } from "@senslop/review-core/notifications";
import { serverEnv } from "../../../data/env/server";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    const update = {
      ...(await cachedRelease(
        workspace.store,
        serverEnv.SENSLOP_APP_VERSION ?? localPackage.version,
        new URL(request.url).searchParams.has("refresh"),
      )),
      installation: serverEnv.SENSLOP_INSTALLATION,
    };
    if (update.available)
      recordNotification(workspace.store, root, {
        id: `update:${update.latest}`,
        kind: "updates",
        reviewId: null,
        title: `Senslop ${update.latest} is available`,
      });
    return Response.json({
      name: "Senslop",
      description: "Local code review for people working with coding agents.",
      update,
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      databaseVersion: Number(
        workspace.store.database.prepare("PRAGMA user_version").get()
          ?.user_version,
      ),
      gitVersion: (await gitProcess(root, ["--version"])).trim(),
      startedAt: serverEnv.SENSLOP_LOCAL_STARTED_AT ?? null,
      pendingJobs: Number(
        workspace.store.database
          .prepare(
            "SELECT count(*) AS count FROM ai_jobs WHERE json_extract(body,'$.status') IN ('queued','running')",
          )
          .get()?.count ?? 0,
      ),
    });
  } catch {
    return Response.json(
      { message: "App information unavailable." },
      { status: 400 },
    );
  }
};

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    z.object({ confirm: z.literal(true) }).parse(await readLocalBody(request));
    const workspace = getWorkspace();
    const root = await workspace.root();
    assertUpdateIdle(workspace.store);
    const release = await cachedRelease(
      workspace.store,
      serverEnv.SENSLOP_APP_VERSION ?? localPackage.version,
      true,
    );
    if (!release.available || !release.latest)
      throw new Error("No newer release is available.");
    if (!["npm", "pnpm"].includes(serverEnv.SENSLOP_INSTALLATION))
      throw new Error(
        "Update this source or archive installation using its original installation method.",
      );
    workspace.store.database
      .prepare(
        "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(
        `pending_update:${root}`,
        JSON.stringify({ version: release.latest }),
      );
    return Response.json({
      message:
        "Update scheduled; restart Senslop after its owning terminal finishes the upgrade.",
    });
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }
};
