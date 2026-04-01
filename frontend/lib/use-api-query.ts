"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCachedData, getCachedError, loadCachedQuery } from "@/lib/query-cache";
import { ApiRequestError } from "@/lib/api";

interface UseApiQueryOptions {
  enabled?: boolean;
  staleMs?: number;
  throwOnError?: boolean;
}

export interface ApiQueryState<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refetch: () => Promise<void>;
}

function normalizeKey(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((part) => String(part ?? "null")).join("::");
}

export function useApiQuery<T>(
  keyParts: Array<string | number | boolean | null | undefined>,
  fetcher: () => Promise<T>,
  options: UseApiQueryOptions = {},
): ApiQueryState<T> {
  const enabled = options.enabled ?? true;
  const staleMs = options.staleMs ?? 10_000;
  const throwOnError = options.throwOnError ?? false;
  const key = normalizeKey(keyParts);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | undefined>(() => getCachedData<T>(key, staleMs));
  const [error, setError] = useState<Error | null>(() => getCachedError(key, staleMs) ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => enabled && data === undefined && !error);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const execute = useCallback(
    async (force: boolean) => {
      if (!enabled) return;

      const cached = getCachedData<T>(key, staleMs);
      if (!force && cached !== undefined) {
        setData(cached);
        setError(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (data === undefined || force) {
        setIsLoading(true);
      }
      setIsRefreshing(force);

      try {
        const result = await loadCachedQuery<T>(key, () => fetcherRef.current(), force);
        setData(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown query error"));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [enabled, key, staleMs, data],
  );

  useEffect(() => {
    void execute(false);
  }, [execute]);

  const refetch = useCallback(async () => {
    await execute(true);
  }, [execute]);

  if (throwOnError && error && !(error instanceof ApiRequestError && error.status === 401)) {
    throw error;
  }

  return { data, error, isLoading, isRefreshing, refetch };
}
