"use client";

import { useEffect, useMemo, useState } from "react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import {
  enqueueMetaCapiEvent,
  getConnectionById,
  getConnections,
  getFacebookOAuthInit,
  getFacebookOAuthResult,
  getMetaCapiConfigs,
  getMetaCapiEvents,
  getMetaPixelConfigs,
  getMetaPixelDiagnostics,
  getMetaPixelEvents,
  trackMetaPixelBrowserEvent,
  upsertConnection,
  upsertMetaCapiConfig,
  upsertMetaPixelConfig,
  retryMetaCapiEvent,
  type ConnectionSummary,
  type FacebookConnectedPixel,
} from "@/lib/api";
import { ensureMetaPixel, trackMetaPixelEvent } from "@/lib/meta-pixel";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import { TRACKING_ENABLED } from "@/lib/feature-flags";
import { Facebook, Power, RotateCcw, Save, Send } from "lucide-react";

type TrackingTab = "capi" | "pixel";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(";").map((item) => item.trim());
  const found = parts.find((item) => item.startsWith(prefix));
  if (!found) return null;
  return decodeURIComponent(found.slice(prefix.length));
}

function SettingsContent() {
  const { token, ready } = useAuthToken();

  const [activeTab, setActiveTab] = useState<TrackingTab>("capi");
  const [statusText, setStatusText] = useState("");
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const [pixelId, setPixelId] = useState("");
  const [pixelName, setPixelName] = useState("Meta Pixel");
  const [pixelActive, setPixelActive] = useState(true);
  const [autoPageView, setAutoPageView] = useState(true);
  const [pixelSaving, setPixelSaving] = useState(false);

  const [capiName, setCapiName] = useState("Conversions API");
  const [capiPixelId, setCapiPixelId] = useState("");
  const [capiAccessToken, setCapiAccessToken] = useState("");
  const [capiTestCode, setCapiTestCode] = useState("");
  const [capiActive, setCapiActive] = useState(true);
  const [capiSaving, setCapiSaving] = useState(false);
  const [capiSending, setCapiSending] = useState(false);
  const [retryingCapiEventId, setRetryingCapiEventId] = useState<string | null>(null);

  const connectionsQuery = useApiQuery(
    ["connections-for-tracking", token],
    () => getConnections(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 15_000 },
  );

  const pixelConfigQuery = useApiQuery(
    ["meta-pixel-config", token],
    () => getMetaPixelConfigs(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 15_000 },
  );

  const capiConfigQuery = useApiQuery(
    ["meta-capi-config", token],
    () => getMetaCapiConfigs(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 15_000 },
  );

  const diagnosticsQuery = useApiQuery(
    ["meta-pixel-diagnostics", token],
    () => getMetaPixelDiagnostics(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 15_000 },
  );

  const pixelEventsQuery = useApiQuery(
    ["meta-pixel-events", token],
    () => getMetaPixelEvents(token!, { limit: 10, offset: 0 }),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 10_000 },
  );

  const capiEventsQuery = useApiQuery(
    ["meta-capi-events", token],
    () => getMetaCapiEvents(token!, { limit: 10, offset: 0 }),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 10_000 },
  );

  const facebookConnections = useMemo(
    () => (connectionsQuery.data ?? []).filter((row) => row.provider === "facebook"),
    [connectionsQuery.data],
  );

  const activePixelConfig = useMemo(() => {
    const list = pixelConfigQuery.data?.configs ?? [];
    return list.find((item) => item.active) ?? list[0] ?? null;
  }, [pixelConfigQuery.data?.configs]);

  const activeCapiConfig = useMemo(() => {
    const list = capiConfigQuery.data?.configs ?? [];
    return list.find((item) => item.active) ?? list[0] ?? null;
  }, [capiConfigQuery.data?.configs]);

  useEffect(() => {
    if (!activePixelConfig) return;
    setPixelId(activePixelConfig.pixel_id);
    setPixelName(activePixelConfig.name);
    setPixelActive(activePixelConfig.active);
    setAutoPageView(activePixelConfig.auto_page_view);
  }, [activePixelConfig?.id]);

  useEffect(() => {
    if (!activeCapiConfig) return;
    setCapiName(activeCapiConfig.name);
    setCapiPixelId(activeCapiConfig.pixel_id);
    setCapiActive(activeCapiConfig.active);
  }, [activeCapiConfig?.id]);

  async function connectFacebookFromTracking() {
    if (!token) return;
    setConnectingFacebook(true);
    setStatusText("");

    const popup = window.open("about:blank", "facebook-oauth-tracking", "width=720,height=780");
    if (!popup) {
      setConnectingFacebook(false);
      setStatusText("Popup ochilmadi.");
      return;
    }

    try {
      const init = await getFacebookOAuthInit(token);
      popup.location.href = init.auth_url;

      const startedAt = Date.now();
      while (Date.now() - startedAt < 180000) {
        const result = await getFacebookOAuthResult(init.state, token);
        if (result.status === "done") {
          if (!result.success) throw new Error(result.error || "Facebook OAuth xatosi");

          const saved = await upsertConnection(
            {
              provider: "facebook",
              external_id: result.payload.profile.id,
              name: result.payload.profile.name,
              credentials: {
                profile: result.payload.profile,
                pages: result.payload.pages,
                pixels: result.payload.pixels,
                user_access_token: result.payload.user_access_token,
              },
              meta: {
                profile: result.payload.profile,
                pages: result.payload.pages.map((p) => ({ id: p.id, name: p.name, forms: p.forms })),
                pixels: result.payload.pixels,
              },
            },
            token,
          );

          await connectionsQuery.refetch();
          popup.close();
          setSelectedConnectionId(saved.id);
          await applyConnectionToTracking(saved.id, true);
          setStatusText("Facebook ulanishi muvaffaqiyatli. Pixel ID va token auto to'ldirildi.");
          return;
        }
        await new Promise((r) => window.setTimeout(r, 700));
      }

      throw new Error("Facebook OAuth timeout bo'ldi.");
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "Facebook ulanishda xato");
    } finally {
      setConnectingFacebook(false);
    }
  }

  async function applyConnectionToTracking(connectionId: string, force = false) {
    if (!token) return;
    if (!force) setSelectedConnectionId(connectionId);

    try {
      const detail = await getConnectionById(connectionId, token);
      const meta = detail.meta as { pixels?: FacebookConnectedPixel[] };
      const credentials = detail.credentials as {
        user_access_token?: string;
        pixels?: FacebookConnectedPixel[];
      };

      const pixelsFromMeta = Array.isArray(meta.pixels) ? meta.pixels : [];
      const pixelsFromCreds = Array.isArray(credentials.pixels) ? credentials.pixels : [];
      const pixels = pixelsFromMeta.length > 0 ? pixelsFromMeta : pixelsFromCreds;

      if (pixels.length > 0) {
        const firstPixel = pixels[0];
        setPixelId(firstPixel.id);
        setCapiPixelId(firstPixel.id);
      }

      if (typeof credentials.user_access_token === "string" && credentials.user_access_token.length > 0) {
        setCapiAccessToken(credentials.user_access_token);
      }

      if (pixels.length === 0) {
        setStatusText("Ulanishda pixel topilmadi. Ads permissionlarni tekshiring.");
      }
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "Ulanishdan ma'lumot olishda xato");
    }
  }

  async function savePixelConfig() {
    if (!token) return;
    setPixelSaving(true);
    setStatusText("");
    try {
      await upsertMetaPixelConfig(
        {
          name: pixelName.trim() || "Meta Pixel",
          pixel_id: pixelId.trim(),
          active: pixelActive,
          auto_page_view: autoPageView,
        },
        token,
      );
      await Promise.all([pixelConfigQuery.refetch(), diagnosticsQuery.refetch()]);
      setStatusText("Meta Pixel sozlamalari saqlandi.");
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "Pixel saqlashda xato.");
    } finally {
      setPixelSaving(false);
    }
  }

  async function saveCapiConfig() {
    if (!token) return;
    setCapiSaving(true);
    setStatusText("");
    try {
      await upsertMetaCapiConfig(
        {
          name: capiName.trim() || "Conversions API",
          pixel_id: capiPixelId.trim(),
          access_token: capiAccessToken.trim(),
          test_event_code: capiTestCode.trim() || undefined,
          active: capiActive,
        },
        token,
      );
      setCapiAccessToken("");
      setCapiTestCode("");
      await Promise.all([capiConfigQuery.refetch(), capiEventsQuery.refetch(), diagnosticsQuery.refetch()]);
      setStatusText("Conversions API sozlamalari saqlandi.");
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "CAPI saqlashda xato.");
    } finally {
      setCapiSaving(false);
    }
  }

  async function sendCapiTestEvent() {
    if (!token) return;
    if (!activeCapiConfig) {
      setStatusText("Avval active Conversions API config yarating.");
      return;
    }

    setCapiSending(true);
    setStatusText("");
    try {
      const eventId = `capi_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const sourceUrl = typeof window !== "undefined" ? window.location.href : "";
      await enqueueMetaCapiEvent(
        {
          config_id: activeCapiConfig.id,
          source: "settings_manual_test",
          event_name: "Lead",
          event_id: eventId,
          event_time: new Date().toISOString(),
          action_source: "website",
          event_source_url: sourceUrl,
          user_data: {
            em: "test@example.com",
            ph: "+998901234567",
            client_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            fbp: getCookie("_fbp") ?? undefined,
            fbc: getCookie("_fbc") ?? undefined,
          },
          custom_data: {
            value: 1,
            currency: "USD",
            content_name: "Lead test event",
          },
        },
        token,
      );

      await Promise.all([capiEventsQuery.refetch(), diagnosticsQuery.refetch()]);
      setStatusText("CAPI test event navbatga qo'shildi. Holatni jadvaldan tekshiring.");
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "CAPI test event yuborishda xato.");
    } finally {
      setCapiSending(false);
    }
  }

  async function sendPixelTestEvent() {
    if (!token) return;
    const config = activePixelConfig;
    if (!config) {
      setStatusText("Avval active Pixel config yarating.");
      return;
    }

    const eventId = `px_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const sourceUrl = typeof window !== "undefined" ? window.location.href : "";
    const eventTimeIso = new Date().toISOString();

    const initResult = ensureMetaPixel(config.pixel_id);
    const browserResult = initResult.sent
      ? trackMetaPixelEvent({ eventName: "PageView", eventId, customData: { source: "settings_test" } })
      : initResult;

    await trackMetaPixelBrowserEvent(
      {
        config_id: config.id,
        source: "settings_test",
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
        custom_data: { mode: "manual_test" },
        browser_meta: { pathname: typeof window !== "undefined" ? window.location.pathname : "/settings" },
        fbq_sent: browserResult.sent,
        blocked_reason: browserResult.sent ? undefined : browserResult.blockedReason ?? "fbq_blocked",
      },
      token,
    );

    if (!browserResult.sent && activeCapiConfig) {
      await enqueueMetaCapiEvent(
        {
          config_id: activeCapiConfig.id,
          source: "pixel_fallback_test",
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
          custom_data: { mode: "manual_test_fallback" },
        },
        token,
      );
      setStatusText("Pixel bloklandi, CAPI fallback yuborildi.");
    } else {
      setStatusText("Pixel test event yuborildi.");
    }

    await Promise.all([pixelEventsQuery.refetch(), capiEventsQuery.refetch(), diagnosticsQuery.refetch()]);
  }

  async function retryCapiEventById(eventId: string) {
    if (!token) return;
    setRetryingCapiEventId(eventId);
    setStatusText("");
    try {
      await retryMetaCapiEvent(eventId, token);
      await Promise.all([capiEventsQuery.refetch(), diagnosticsQuery.refetch()]);
      setStatusText("CAPI event qayta navbatga qo'shildi.");
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "CAPI eventni qayta yuborishda xato.");
    } finally {
      setRetryingCapiEventId(null);
    }
  }

  if (!ready || connectionsQuery.isLoading || pixelConfigQuery.isLoading || capiConfigQuery.isLoading || diagnosticsQuery.isLoading || pixelEventsQuery.isLoading || capiEventsQuery.isLoading) {
    return <PageLoading />;
  }

  return (
    <div>
      <section className="panel-soft p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost h-10 ${activeTab === "capi" ? "border-[var(--brand-soft)] text-[var(--brand)]" : ""}`} onClick={() => setActiveTab("capi")} type="button">Conversions API</button>
            <button className={`btn-ghost h-10 ${activeTab === "pixel" ? "border-[var(--brand-soft)] text-[var(--brand)]" : ""}`} onClick={() => setActiveTab("pixel")} type="button">Meta Pixel</button>
          </div>
          <button className="btn-primary" disabled={connectingFacebook} onClick={() => void connectFacebookFromTracking()} type="button">
            <Facebook className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {connectingFacebook ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner size="sm" className="border-[var(--border)] border-t-[var(--surface)]" />
                Ulanmoqda...
              </span>
            ) : "Facebook orqali ulash"}
          </button>
        </div>

        {facebookConnections.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {facebookConnections.map((conn: ConnectionSummary) => (
              <button
                key={conn.id}
                className={`btn-ghost h-9 ${selectedConnectionId === conn.id ? "border-[var(--brand-soft)] text-[var(--brand)]" : ""}`}
                onClick={() => void applyConnectionToTracking(conn.id)}
                type="button"
              >
                {conn.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">Facebook ulanish topilmadi. "Facebook orqali ulash" ni bosing.</p>
        )}
      </section>

      {activeTab === "capi" ? (
        <section className="panel-soft p-5">
          <p className="section-kicker">Conversions API boshqaruvi</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-[var(--text-secondary)]">Nomi<input className="field mt-1 h-10" value={capiName} onChange={(e) => setCapiName(e.target.value)} /></label>
            <label className="text-xs text-[var(--text-secondary)]">Pixel ID<input className="field mt-1 h-10" value={capiPixelId} onChange={(e) => setCapiPixelId(e.target.value)} placeholder="Masalan: 123456789012345" /></label>
            <label className="text-xs text-[var(--text-secondary)] md:col-span-2">Access Token<input className="field mt-1 h-10" value={capiAccessToken} onChange={(e) => setCapiAccessToken(e.target.value)} placeholder="EAAB..." /></label>
            <label className="text-xs text-[var(--text-secondary)] md:col-span-2">Test Event Code (ixtiyoriy)<input className="field mt-1 h-10" value={capiTestCode} onChange={(e) => setCapiTestCode(e.target.value)} placeholder="TEST12345" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={`btn-ghost h-10 ${capiActive ? "border-[var(--success-border)] text-[var(--success)]" : ""}`} onClick={() => setCapiActive((v) => !v)} type="button">
              <Power className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {capiActive ? "Faol" : "Faol emas"}
            </button>
            <button className="btn-primary" disabled={capiSaving || !capiPixelId.trim() || !capiAccessToken.trim()} onClick={() => void saveCapiConfig()} type="button">
              {capiSaving ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-[var(--border)] border-t-[var(--surface)]" />
                  Saqlanmoqda...
                </span>
              ) : (
                <>
                  <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  CAPI saqlash
                </>
              )}
            </button>
            <button className="btn-ghost" disabled={capiSending || !activeCapiConfig} onClick={() => void sendCapiTestEvent()} type="button">
              {capiSending ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  Yuborilmoqda...
                </span>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  CAPI test event
                </>
              )}
            </button>
          </div>
          {activeCapiConfig ? <p className="mt-2 text-xs text-[var(--text-secondary)]">Active CAPI: <span className="font-medium text-[var(--text-primary)]">{activeCapiConfig.pixel_id}</span></p> : <p className="mt-2 text-xs text-[var(--warning)]">Active CAPI config topilmadi.</p>}
        </section>
      ) : (
        <section className="panel-soft p-5">
          <p className="section-kicker">Meta Pixel boshqaruvi</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-[var(--text-secondary)]">Nomi<input className="field mt-1 h-10" value={pixelName} onChange={(e) => setPixelName(e.target.value)} /></label>
            <label className="text-xs text-[var(--text-secondary)]">Pixel ID<input className="field mt-1 h-10" value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="Masalan: 123456789012345" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={`btn-ghost h-10 ${pixelActive ? "border-[var(--success-border)] text-[var(--success)]" : ""}`} onClick={() => setPixelActive((v) => !v)} type="button">
              <Power className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {pixelActive ? "Faol" : "Faol emas"}
            </button>
            <button className={`btn-ghost h-10 ${autoPageView ? "border-[var(--brand-soft)] text-[var(--brand)]" : ""}`} onClick={() => setAutoPageView((v) => !v)} type="button">{autoPageView ? "Auto PageView ON" : "Auto PageView OFF"}</button>
            <button className="btn-primary" disabled={pixelSaving || !pixelId.trim()} onClick={() => void savePixelConfig()} type="button">
              {pixelSaving ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-[var(--border)] border-t-[var(--surface)]" />
                  Saqlanmoqda...
                </span>
              ) : (
                <>
                  <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Pixel saqlash
                </>
              )}
            </button>
            <button className="btn-ghost" disabled={!activePixelConfig} onClick={() => void sendPixelTestEvent()} type="button">
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Pixel test event
            </button>
          </div>
          {activePixelConfig ? <p className="mt-2 text-xs text-[var(--text-secondary)]">Active Pixel: <span className="font-medium text-[var(--text-primary)]">{activePixelConfig.pixel_id}</span></p> : <p className="mt-2 text-xs text-[var(--warning)]">Active Pixel config topilmadi.</p>}
        </section>
      )}

      <section className="panel-soft mt-4 p-5">
        <p className="section-kicker">Parity diagnostika</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm lg:grid-cols-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--text-secondary)]">Pixel</p><p className="mt-1 text-lg font-semibold">{diagnosticsQuery.data?.summary.pixel_events ?? 0}</p></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--text-secondary)]">CAPI</p><p className="mt-1 text-lg font-semibold">{diagnosticsQuery.data?.summary.capi_events ?? 0}</p></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--text-secondary)]">CAPI-da yo'q</p><p className="mt-1 text-lg font-semibold text-[var(--warning)]">{diagnosticsQuery.data?.summary.missing_in_capi ?? 0}</p></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--text-secondary)]">Pixel-da yo'q</p><p className="mt-1 text-lg font-semibold text-[var(--warning)]">{diagnosticsQuery.data?.summary.missing_in_pixel ?? 0}</p></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--text-secondary)]">Nom mismatch</p><p className="mt-1 text-lg font-semibold text-[var(--danger)]">{diagnosticsQuery.data?.summary.event_name_mismatch ?? 0}</p></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--text-secondary)]">Time drift</p><p className="mt-1 text-lg font-semibold text-[var(--danger)]">{diagnosticsQuery.data?.summary.timestamp_drift ?? 0}</p></div>
        </div>
        {statusText ? <p className="mt-3 text-xs text-[var(--text-secondary)]">{statusText}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 mt-4">
        <article className="panel-soft p-5">
          <p className="section-kicker">So'nggi CAPI eventlar</p>
          <div className="table-shell mt-3">
            <table className="min-w-full text-sm">
              <thead><tr className="table-head"><th className="px-3 py-3">Event</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Xato</th><th className="px-3 py-3">Vaqt</th><th className="px-3 py-3 text-right">Amal</th></tr></thead>
              <tbody>
                {(capiEventsQuery.data?.events ?? []).length === 0 ? (
                  <tr><td className="px-3 py-6 text-sm text-[var(--text-secondary)]" colSpan={5}>CAPI event yo'q</td></tr>
                ) : (
                  (capiEventsQuery.data?.events ?? []).map((event) => (
                    <tr key={event.id} className="table-row">
                      <td className="px-3 py-3"><p>{event.event_name}</p><p className="font-mono text-[11px] text-[var(--text-secondary)]">{event.event_id.slice(0, 14)}...</p></td>
                      <td className="px-3 py-3"><span className="rounded-full bg-[var(--status-soft)] px-2 py-1 text-xs text-[var(--text-primary)]">{event.status}</span></td>
                      <td className="px-3 py-3 max-w-[260px] truncate text-xs text-[var(--danger)]" title={event.last_error ?? ""}>{event.last_error ?? "-"}</td>
                      <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{new Date(event.updated_at).toLocaleString()}</td>
                      <td className="px-3 py-3 text-right">
                        {(event.status === "failed" || event.status === "dlq") ? (
                          <button
                            className="btn-ghost h-8"
                            disabled={retryingCapiEventId === event.id}
                            onClick={() => void retryCapiEventById(event.id)}
                            type="button"
                          >
                            {retryingCapiEventId === event.id ? (
                              <span className="inline-flex items-center gap-2">
                                <LoadingSpinner size="sm" />
                                Qayta...
                              </span>
                            ) : (
                              <>
                                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                Qayta yuborish
                              </>
                            )}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel-soft p-5">
          <p className="section-kicker">So'nggi Pixel eventlar</p>
          <div className="table-shell mt-3">
            <table className="min-w-full text-sm">
              <thead><tr className="table-head"><th className="px-3 py-3">Event</th><th className="px-3 py-3">Browser</th><th className="px-3 py-3">Vaqt</th></tr></thead>
              <tbody>
                {(pixelEventsQuery.data?.events ?? []).length === 0 ? (
                  <tr><td className="px-3 py-6 text-sm text-[var(--text-secondary)]" colSpan={3}>Pixel event yo'q</td></tr>
                ) : (
                  (pixelEventsQuery.data?.events ?? []).map((event) => (
                    <tr key={event.id} className="table-row">
                      <td className="px-3 py-3"><p>{event.event_name}</p><p className="font-mono text-[11px] text-[var(--text-secondary)]">{event.event_id.slice(0, 14)}...</p></td>
                      <td className="px-3 py-3">{event.fbq_sent ? <span className="rounded-full bg-[var(--success-soft)] px-2 py-1 text-xs text-[var(--success)]">Yuborildi</span> : <span className="rounded-full bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)]">Bloklangan</span>}</td>
                      <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{new Date(event.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  if (!TRACKING_ENABLED) {
    return (
      <DataPlaceholder
        title="Tracking o'chirilgan"
        description="Hozircha Meta Pixel va Conversions API backend va UI darajasida disable holatda."
      />
    );
  }

  return (
    <QueryBoundary>
      <SettingsContent />
    </QueryBoundary>
  );
}

