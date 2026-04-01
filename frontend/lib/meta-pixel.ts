"use client";

export interface BrowserPixelTrackResult {
  sent: boolean;
  blockedReason?: string;
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _leadflowMetaPixelId?: string;
  }
}

function injectPixelBaseScript(pixelId: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window._leadflowMetaPixelId === pixelId) return;

  if (!window.fbq) {
    ((f: Window, b: Document, e: string, v: string, n?: unknown, t?: HTMLScriptElement, s?: Element) => {
      if ((f as unknown as { fbq?: unknown }).fbq) return;
      n = (...args: unknown[]) => {
        ((n as unknown as { callMethod?: (...innerArgs: unknown[]) => void }).callMethod)
          ? (n as unknown as { callMethod: (...innerArgs: unknown[]) => void }).callMethod(...args)
          : (n as unknown as { queue: unknown[] }).queue.push(args);
      };
      (f as unknown as { fbq: unknown }).fbq = n;
      (n as unknown as { push?: unknown }).push = n;
      (n as unknown as { loaded?: boolean }).loaded = true;
      (n as unknown as { version?: string }).version = "2.0";
      (n as unknown as { queue?: unknown[] }).queue = [];
      t = b.createElement(e) as HTMLScriptElement;
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode?.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  }

  window.fbq?.("init", pixelId);
  window._leadflowMetaPixelId = pixelId;
}

export function ensureMetaPixel(pixelId: string): BrowserPixelTrackResult {
  if (!pixelId || pixelId.trim().length === 0) {
    return { sent: false, blockedReason: "pixel_id_not_set" };
  }
  if (typeof window === "undefined") {
    return { sent: false, blockedReason: "window_unavailable" };
  }
  try {
    injectPixelBaseScript(pixelId);
    if (!window.fbq) {
      return { sent: false, blockedReason: "fbq_unavailable_after_init" };
    }
    return { sent: true };
  } catch {
    return { sent: false, blockedReason: "pixel_init_failed" };
  }
}

export function trackMetaPixelEvent(input: {
  eventName: string;
  eventId: string;
  customData?: Record<string, unknown>;
}): BrowserPixelTrackResult {
  if (typeof window === "undefined") {
    return { sent: false, blockedReason: "window_unavailable" };
  }
  if (!window.fbq) {
    return { sent: false, blockedReason: "fbq_not_loaded" };
  }

  try {
    window.fbq("track", input.eventName, input.customData ?? {}, { eventID: input.eventId });
    return { sent: true };
  } catch {
    return { sent: false, blockedReason: "fbq_track_failed" };
  }
}
