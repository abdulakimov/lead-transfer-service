"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  enqueueMetaCapiEvent,
  getMetaPixelConfigs,
  trackMetaPixelBrowserEvent,
  type MetaPixelConfig,
} from "@/lib/api";
import { useAuthToken } from "@/lib/use-auth-token";
import { ensureMetaPixel, trackMetaPixelEvent } from "@/lib/meta-pixel";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(";").map((item) => item.trim());
  const found = parts.find((item) => item.startsWith(prefix));
  if (!found) return null;
  return decodeURIComponent(found.slice(prefix.length));
}

export function MetaPixelBootstrap() {
  const { token, ready } = useAuthToken();
  const pathname = usePathname();
  const configRef = useRef<MetaPixelConfig | null>(null);
  const lastTrackedKeyRef = useRef<string | null>(null);

  const sourceUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${pathname ?? "/"}`;
  }, [pathname]);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;

    void getMetaPixelConfigs(token)
      .then((payload) => {
        if (cancelled) return;
        const active = payload.configs.find((item) => item.active) ?? null;
        configRef.current = active;
        if (active) {
          ensureMetaPixel(active.pixel_id);
        }
      })
      .catch(() => {
        if (cancelled) return;
        configRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  useEffect(() => {
    if (!ready || !token) return;
    const config = configRef.current;
    if (!config || !config.active || !config.auto_page_view) return;
    if (!sourceUrl) return;

    const trackKey = `${config.id}:${sourceUrl}`;
    if (lastTrackedKeyRef.current === trackKey) return;
    lastTrackedKeyRef.current = trackKey;

    const eventId = `px_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const eventTimeIso = new Date().toISOString();

    const initResult = ensureMetaPixel(config.pixel_id);
    const browserResult = initResult.sent
      ? trackMetaPixelEvent({
        eventName: "PageView",
        eventId,
        customData: {},
      })
      : initResult;

    const browserMeta = {
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      language: typeof navigator !== "undefined" ? navigator.language : "",
      pathname: pathname ?? "/",
    };

    void trackMetaPixelBrowserEvent(
      {
        config_id: config.id,
        source: "pixel_bootstrap",
        event_name: "PageView",
        event_id: eventId,
        event_time: eventTimeIso,
        action_source: "website",
        event_source_url: sourceUrl,
        user_data: {
          fbp: getCookie("_fbp") ?? undefined,
          fbc: getCookie("_fbc") ?? undefined,
          client_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        },
        custom_data: {
          path: pathname ?? "/",
        },
        browser_meta: browserMeta,
        fbq_sent: browserResult.sent,
        blocked_reason: browserResult.sent ? undefined : browserResult.blockedReason ?? "fbq_blocked",
      },
      token,
    ).catch(() => undefined);

    if (!browserResult.sent) {
      void enqueueMetaCapiEvent(
        {
          source: "pixel_fallback",
          event_name: "PageView",
          event_id: eventId,
          event_time: eventTimeIso,
          action_source: "website",
          event_source_url: sourceUrl,
          user_data: {
            fbp: getCookie("_fbp") ?? undefined,
            fbc: getCookie("_fbc") ?? undefined,
            client_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          },
          custom_data: {
            path: pathname ?? "/",
            fallback_reason: browserResult.blockedReason ?? "fbq_blocked",
          },
        },
        token,
      ).catch(() => undefined);
    }
  }, [ready, token, pathname, sourceUrl]);

  return null;
}
