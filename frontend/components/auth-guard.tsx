"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthToken } from "@/lib/use-auth-token";
import { LoadingSpinner } from "@/components/loading-spinner";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, ready } = useAuthToken();

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      router.replace("/login");
    }
  }, [ready, token, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!token) {
    return null;
  }

  return <>{children}</>;
}
