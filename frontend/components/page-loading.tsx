"use client";

import { LoadingSpinner } from "@/components/loading-spinner";

export function PageLoading() {
  return (
    <div className="flex min-h-[42vh] items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}

