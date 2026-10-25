import type { SavedReviewSchema } from "@senslop/contracts";
import type { WorkspaceClient } from "../workspace/workspace-client.js";

export const readReview = (client: WorkspaceClient, id = "current") =>
  client.request<SavedReviewSchema>(
    `/api/workspace?id=${encodeURIComponent(id)}`,
  );
