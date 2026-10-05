import { cliStatusSchema } from "@senslop/contracts";
import type { Credentials } from "../auth/credentials.js";
import { requestJSON } from "../../lib/http.js";

export const fetchStatus = async (credentials: Credentials) => {
  try {
    return cliStatusSchema.parse(
      await requestJSON<unknown>(
        credentials.baseURL,
        "/api/cli/status",
        {},
        credentials.token,
      ),
    );
  } catch {
    return null;
  }
};
