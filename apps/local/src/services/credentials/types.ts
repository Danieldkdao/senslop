export type CredentialStore = {
  get: (id: string) => Promise<string | null>;
  set: (id: string, secret: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
};
