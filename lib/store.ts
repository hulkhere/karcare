import { Redis } from "@upstash/redis";

/** Minimal key-value store used for the monthly invoice archive. */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  /** Write only if the key doesn't exist yet. Returns false if it already existed. */
  setIfAbsent<T>(key: string, value: T): Promise<boolean>;
}

function redisStore(url: string, token: string): KV {
  const redis = new Redis({ url, token });
  return {
    get: (key) => redis.get(key),
    setIfAbsent: async (key, value) => (await redis.set(key, value, { nx: true })) === "OK",
  };
}

/** Local development fallback: JSON files under .data/ */
function fileStore(): KV {
  const dir = `${process.cwd()}/.data`;
  const file = (key: string) => `${dir}/${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  return {
    async get(key) {
      const fs = await import("node:fs/promises");
      try {
        return JSON.parse(await fs.readFile(file(key), "utf8"));
      } catch {
        return null;
      }
    },
    async setIfAbsent(key, value) {
      const fs = await import("node:fs/promises");
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.writeFile(file(key), JSON.stringify(value), { flag: "wx" });
        return true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw e;
      }
    },
  };
}

let store: KV | null = null;

export function getStore(): KV {
  if (store) return store;
  // Vercel's Upstash integration sets KV_REST_API_*; Upstash itself uses UPSTASH_REDIS_REST_*.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) store = redisStore(url, token);
  else if (process.env.VERCEL) {
    throw new Error(
      "No storage configured for the invoice archive. In Vercel, add the Upstash Redis integration (Storage → Upstash → Redis) and redeploy.",
    );
  } else store = fileStore();
  return store;
}
