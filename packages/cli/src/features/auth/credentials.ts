import { serverEnv } from "../../data/env/server.js";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  chmod,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { secureBaseURL } from "@senslop/contracts";

export type Credentials = {
  baseURL: string;
  token: string;
};

export const credentialsDirectory = () => {
  if (process.platform === "win32")
    return join(
      serverEnv.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
      "senslop",
    );
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "senslop");
  return join(
    serverEnv.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "senslop",
  );
};
export const saveCredentials = async (
  value: Credentials,
  directory = credentialsDirectory(),
) => {
  secureBaseURL(value.baseURL);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temp = join(directory, `credentials-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    await rename(temp, join(directory, "credentials.json"));
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
};
export const readCredentials = async (
  directory = credentialsDirectory(),
): Promise<Credentials | null> => {
  try {
    const value = JSON.parse(
      await readFile(join(directory, "credentials.json"), "utf8"),
    );
    if (
      typeof value.token !== "string" ||
      !value.token ||
      typeof value.baseURL !== "string"
    )
      throw new Error("Invalid credential file. Run senslop login again.");
    return { baseURL: secureBaseURL(value.baseURL), token: value.token };
  } catch {
    return null;
  }
};
export const removeCredentials = async (directory = credentialsDirectory()) => {
  await unlink(join(directory, "credentials.json")).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
};
export const requireCredentials = async () => {
  const value = await readCredentials();
  if (!value)
    throw new Error("Sign in first with senslop login --url WEBSITE_URL.");
  return value;
};
