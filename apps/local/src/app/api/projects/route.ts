import { z } from "zod";
import { dirname, basename } from "node:path";
import { access } from "node:fs/promises";
import {
  knownProjectRoots,
  discoverProjectSession,
  discoverWorktrees,
} from "@senslop/review-core/projects";
import { projectManifests } from "@senslop/review-core/maintenance";
import { readCommonGitDirectory } from "@senslop/review-core/git";
import { serverEnv } from "../../../data/env/server";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";

const projectRoots = async (
  store: ReturnType<typeof getWorkspace>["store"],
  current: string,
) => {
  const known = knownProjectRoots(store, current);
  const worktrees = (
    await Promise.all(
      known.map((root) => discoverWorktrees(root).catch(() => [])),
    )
  ).flat();
  const managed = new Set(
    known.flatMap((root) =>
      projectManifests(store, root).map((manifest) => manifest.directory),
    ),
  );
  return {
    roots: [
      ...new Set([...known, ...worktrees.map((worktree) => worktree.root)]),
    ].filter((root) => !managed.has(root)),
    worktrees,
  };
};

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const current = await workspace.root();
    const { roots, worktrees } = await projectRoots(workspace.store, current);
    const params = new URL(request.url).searchParams;
    if (params.has("root")) {
      const root = params.get("root")!;
      if (!roots.includes(root)) throw new Error("Unknown project.");
      const reviewId = params.get("reviewId");
      if (reviewId) {
        const review = workspace.store.getReview(
          root,
          z.uuid().parse(reviewId),
        );
        if (!review) throw new Error("Saved evidence unavailable.");
        return Response.json(review);
      }
      return Response.json(workspace.store.listReviews(root));
    }
    const projects = await Promise.all(
      roots.map(async (root) => {
        const session = await discoverProjectSession(
          dirname(serverEnv.SENSLOP_LOCAL_DATABASE!),
          root,
        );
        const exists = await access(root).then(
          () => true,
          () => false,
        );
        const common = workspace.store.database
          .prepare("SELECT value FROM preferences WHERE name=?")
          .get(`project_common:${root}`);
        return {
          root,
          name: basename(root),
          commonDirectory: common
            ? String(common.value)
            : await readCommonGitDirectory(root).catch(() => null),
          branch:
            worktrees.find((worktree) => worktree.root === root)?.branch ??
            null,
          head:
            worktrees.find((worktree) => worktree.root === root)?.head ?? null,
          status: session ? "running" : exists ? "stopped" : "missing",
          current: root === current,
          reviewCount: workspace.store.listReviews(root).length,
        };
      }),
    );
    return Response.json(projects);
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
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
    const workspace = getWorkspace();
    const current = await workspace.root();
    const input = z
      .object({ root: z.string().min(1) })
      .parse(await readLocalBody(request));
    if (
      !(await projectRoots(workspace.store, current)).roots.includes(input.root)
    )
      throw new Error("Unknown project.");
    const session = await discoverProjectSession(
      dirname(serverEnv.SENSLOP_LOCAL_DATABASE!),
      input.root,
    );
    if (!session)
      throw new Error(
        "Start the selected project's local app in its terminal.",
      );
    return Response.json({
      url: `${session.origin}/api/session?token=${session.token}`,
    });
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }
};
