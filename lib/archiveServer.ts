import "server-only";
import { configFromEnv, type ArchiveDeps } from "./archive";
import { fetchOrdersCreatedBetween } from "./shopify";
import { getStore } from "./store";

export const archiveDeps = (): ArchiveDeps => ({
  store: getStore(),
  fetchRaw: fetchOrdersCreatedBetween,
  config: configFromEnv(),
});
