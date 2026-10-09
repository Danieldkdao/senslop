import { readFile, stat } from "node:fs/promises";
import { serverEnv } from "@/data/env/server";
import { localPreviewSchema } from "@senslop/contracts";

export const GET = async (request: Request) => {
  const path = serverEnv.SENSLOP_LOCAL_SNAPSHOT;
  if (!path)
    return Response.json(
      { message: "Local snapshot path unavailable." },
      { status: 503 },
    );
  try {
    const info = await stat(path);
    const etag = `W/"${info.mtimeMs}-${info.size}"`;
    const headers = { "Cache-Control": "no-store", ETag: etag };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    const preview = localPreviewSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
    return Response.json(preview, { headers });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return Response.json(null, { headers: { "Cache-Control": "no-store" } });
    return Response.json(
      {
        message:
          "Local snapshot could not be read. Inspect your changes again.",
      },
      { status: 503 },
    );
  }
};
