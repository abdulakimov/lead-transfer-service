"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/session";

export function useAuthToken() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getAccessToken());
    setReady(true);
  }, []);

  return { token, ready };
}
