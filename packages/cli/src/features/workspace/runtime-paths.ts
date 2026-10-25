import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { serverEnv } from "../../data/env/server.js";
export { workspaceStateDirectory } from "@senslop/review-core/runtime-paths";

export const applicationDataDirectory = () => {
  if (serverEnv.SENSLOP_DATA_DIRECTORY) return serverEnv.SENSLOP_DATA_DIRECTORY;
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Senslop");
    case "win32":
      return join(
        serverEnv.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
        "Senslop",
      );
    default:
      return join(
        serverEnv.XDG_DATA_HOME && isAbsolute(serverEnv.XDG_DATA_HOME)
          ? serverEnv.XDG_DATA_HOME
          : join(homedir(), ".local", "share"),
        "senslop",
      );
  }
};
