import type { PreviewEventSchema } from "@senslop/contracts";
import type { LivePreview } from "../types";

export const reducePreview = (
  current: LivePreview | null,
  event: PreviewEventSchema,
): LivePreview | null => {
  if (event.type === "preview.start")
    return {
      id: event.previewId,
      source: event.source,
      expectedFiles: event.fileCount,
      files: [],
      excluded: event.excluded,
      status: "receiving",
      error: null,
    };
  if (
    !current ||
    current.id !== event.previewId ||
    current.status !== "receiving"
  )
    return current;
  switch (event.type) {
    case "preview.file":
      if (
        event.index !== current.files.length ||
        current.files.length >= current.expectedFiles ||
        current.files.some((file) => file.path === event.file.path)
      )
        return {
          ...current,
          status: "failed",
          error: "Preview arrived out of order. Send it again from the CLI.",
        };
      return { ...current, files: [...current.files, event.file] };
    case "preview.complete":
      return current.files.length === current.expectedFiles
        ? { ...current, status: "ready" }
        : {
            ...current,
            status: "failed",
            error: "Preview is incomplete. Send it again from the CLI.",
          };
    case "preview.failed":
      return { ...current, status: "failed", error: event.message };
  }
};
