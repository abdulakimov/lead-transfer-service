"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/session";

export function useAuthToken() {
  const [state, setState] = useState<{ ready: boolean; token: string | null }>({
    ready: false,
    token: null,
  });

  useEffect(() => {
    setState({
      ready: true,
      token: getAccessToken(),
    });
  }, []);

  return state;
}
