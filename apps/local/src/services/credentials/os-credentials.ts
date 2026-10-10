import type { CredentialStore } from "./types";

const entry = async (id: string) => {
  const { AsyncEntry } = await import("@napi-rs/keyring");
  // Linux must use persistent Secret Service, never the library's in-memory fallback.
  return new AsyncEntry("com.senslop.providers", id, {
    linux: { store: "secret-service" },
  });
};

export const osCredentials: CredentialStore = {
  get: async (id) => {
    const bytes = await (await entry(id)).getSecret();
    return bytes?.length
      ? new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes))
      : null;
  },
  set: async (id, secret) => {
    await (await entry(id)).setPassword(secret);
  },
  delete: async (id) => {
    await (await entry(id)).deleteCredential();
  },
};
