"use client";

import { LoadingSpinner } from "@/components/loading-spinner";

export function PageLoading() {
  return (
    <div className="flex min-h-[calc(100vh-180px)] w-full items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
