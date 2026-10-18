import "server-only";
import type { LocalStore } from "@senslop/review-core/storage";
import { serverEnv } from "../../data/env/server";
import { getWorkspace } from "../../features/workspace/lib/server-workspace";
import { osCredentials } from "../credentials/os-credentials";
import { SubscriptionService } from "./subscription-service";

const globalSubscriptions = globalThis as typeof globalThis & {
  senslopSubscriptions?: Map<string | LocalStore, SubscriptionService>;
};

export const getSubscriptionService = (
  store = getWorkspace().store,
): SubscriptionService => {
  const services = (globalSubscriptions.senslopSubscriptions ??= new Map<
    string | LocalStore,
    SubscriptionService
  >());
  const key = serverEnv.SENSLOP_LOCAL_DATABASE ?? store;
  let service = services.get(key);
  if (!service) {
    service = new SubscriptionService(store, osCredentials);
    services.set(key, service);
  }
  return service;
};
