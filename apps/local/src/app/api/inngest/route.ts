import { serve } from "inngest/next";
import { inngest } from "../../../services/inngest/client";
import {
  analysisJob,
  checkJob,
  verificationJob,
  resumeJobs,
} from "../../../services/inngest/functions";

const handlers = serve({
  client: inngest,
  functions: [analysisJob, checkJob, verificationJob],
});

export const { GET, POST } = handlers;
export const PUT = async (...args: Parameters<typeof handlers.PUT>) => {
  const response = await handlers.PUT(...args);
  if (response.ok) await resumeJobs();
  return response;
};
