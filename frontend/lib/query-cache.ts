type CacheEntry<T> = {
  data?: T;
  error?: Error;
  updatedAt: number;
  promise?: Promise<T>;
};

const QUERY_CACHE = new Map<string, CacheEntry<unknown>>();

export function getCachedData<T>(key: string, staleMs: number): T | undefined {
  const entry = QUERY_CACHE.get(key) as CacheEntry<T> | undefined;
  if (!entry || entry.data === undefined) return undefined;
  if (Date.now() - entry.updatedAt > staleMs) return undefined;
  return entry.data;
}

export function getCachedError(key: string, staleMs: number): Error | undefined {
  const entry = QUERY_CACHE.get(key);
  if (!entry || !entry.error) return undefined;
  if (Date.now() - entry.updatedAt > staleMs) return undefined;
  return entry.error;
}

export async function loadCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  force = false,
): Promise<T> {
  const existing = QUERY_CACHE.get(key) as CacheEntry<T> | undefined;
  if (existing?.promise && !force) {
    return existing.promise;
  }

  const promise = fetcher()
    .then((data) => {
      QUERY_CACHE.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error("Unknown query error");
      QUERY_CACHE.set(key, { error, updatedAt: Date.now() });
      throw error;
    });

  QUERY_CACHE.set(key, {
    data: existing?.data,
    error: undefined,
    updatedAt: existing?.updatedAt ?? 0,
    promise,
  });

  return promise;
}

export function invalidateQueryCache(prefix: string): void {
  for (const key of QUERY_CACHE.keys()) {
    if (key.startsWith(prefix)) {
      QUERY_CACHE.delete(key);
    }
  }
}
