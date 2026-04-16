"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataPlaceholder } from "@/components/data-placeholder";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import {
  deleteConnection,
  getConnections,
  getFacebookOAuthInit,
  getFacebookOAuthResult,
  getGoogleOAuthInit,
  getGoogleOAuthResult,
  refreshFacebookConnectionForms,
  upsertConnection,
  type ConnectionSummary,
} from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import { CheckCircle2, Facebook, Mail, Plus, Trash2, type LucideIcon } from "lucide-react";

type Provider = "facebook" | "google";

const PROVIDER_UI: Record<Provider, { title: string; icon: LucideIcon; badge: string; iconClass: string }> = {
  facebook: {
    title: "Facebook",
    icon: Facebook,
    badge: "border border-[var(--info-border)] bg-[var(--surface)] text-[var(--info)]",
    iconClass: "border border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]",
  },
  google: {
    title: "Google",
    icon: Mail,
    badge: "border border-[var(--success-border)] bg-[var(--surface)] text-[var(--success)]",
    iconClass: "border border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
  },
};

function getProviderDetails(provider: Provider, connection: ConnectionSummary): string {
  if (provider === "facebook") {
    const pages = Array.isArray((connection.meta as { pages?: unknown }).pages)
      ? (((connection.meta as { pages?: Array<{ forms?: unknown[] }> }).pages) ?? [])
      : [];
    const formCount = pages.reduce((acc, page) => acc + (Array.isArray(page.forms) ? page.forms.length : 0), 0);
    return `${pages.length} ta sahifa, ${formCount} ta forma`;
  }

  const spreadsheets = Array.isArray((connection.meta as { spreadsheets?: unknown }).spreadsheets)
    ? (((connection.meta as { spreadsheets?: unknown[] }).spreadsheets) ?? [])
    : [];
  return `${spreadsheets.length} ta spreadsheet`;
}

function ConnectionsContent() {
  const { token, ready } = useAuthToken();
  const query = useApiQuery<ConnectionSummary[]>(
    ["connections", token],
    () => getConnections(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 15_000 },
  );

  const [loadingProvider, setLoadingProvider] = useState<"facebook" | "google" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteConnectionId, setPendingDeleteConnectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formsAutoRefreshStartedRef = useRef(false);

  async function connectFacebook() {
    if (!token) return;
    setLoadingProvider("facebook");
    setError(null);
    const popup = window.open("about:blank", "facebook-oauth-connections", "width=720,height=780");
    if (!popup) {
      setLoadingProvider(null);
      setError("Popup ochilmadi.");
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
          const oauthPages = Array.isArray(result.payload.pages) ? result.payload.pages : [];
          const saved = await upsertConnection(
            {
              provider: "facebook",
              external_id: result.payload.profile.id,
              name: result.payload.profile.name,
              credentials: {
                profile: result.payload.profile,
                pages: oauthPages,
                user_access_token: result.payload.user_access_token,
                short_lived_user_access_token: result.payload.short_lived_user_access_token,
              },
              meta: {
                profile: result.payload.profile,
                pages: oauthPages.map((p) => ({
                  id: p.id,
                  name: p.name,
                  forms: p.forms,
                })),
              },
            },
            token,
          );
          const refreshed = await refreshFacebookConnectionForms(saved.id, token);
          if (!refreshed.pages || refreshed.pages.length === 0) {
            throw new Error("Facebook sahifalari topilmadi. Facebook Business Integrations'dan ulanishni o'chirib, barcha Page ruxsatlari bilan qayta ulang.");
          }
          const hasAnyForm = refreshed.pages.some((page) => (page.forms?.length ?? 0) > 0);
          if (!hasAnyForm && refreshed.errors.length > 0) {
            setError("Ba'zi sahifalarda formalarni olish cheklangan. Permission va Page access ni tekshiring.");
          } else {
            setError(null);
          }
          await query.refetch();
          popup.close();
          return;
        }
        await new Promise((r) => window.setTimeout(r, 700));
      }
      throw new Error("Facebook OAuth timeout bo'ldi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Facebook ulanish xatosi");
    } finally {
      setLoadingProvider(null);
    }
  }

  async function connectGoogle() {
    if (!token) return;
    setLoadingProvider("google");
    setError(null);
    const popup = window.open("about:blank", "google-oauth-connections", "width=720,height=780");
    if (!popup) {
      setLoadingProvider(null);
      setError("Popup ochilmadi.");
      return;
    }

    try {
      const init = await getGoogleOAuthInit(token);
      popup.location.href = init.auth_url;

      const startedAt = Date.now();
      while (Date.now() - startedAt < 180000) {
        const result = await getGoogleOAuthResult(init.state, token);
        if (result.status === "done") {
          if (!result.success) throw new Error(result.error || "Google OAuth xatosi");
          await upsertConnection(
            {
              provider: "google",
              external_id: result.payload.profile.id,
              name: result.payload.profile.email,
              credentials: {
                profile: result.payload.profile,
                refresh_token: result.payload.refresh_token,
                spreadsheets: result.payload.spreadsheets,
              },
              meta: {
                profile: result.payload.profile,
                spreadsheets: result.payload.spreadsheets,
              },
            },
            token,
          );
          await query.refetch();
          popup.close();
          return;
        }
        await new Promise((r) => window.setTimeout(r, 700));
      }
      throw new Error("Google OAuth timeout bo'ldi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google ulanish xatosi");
    } finally {
      setLoadingProvider(null);
    }
  }

  async function removeConnection(id: string) {
    setPendingDeleteConnectionId(id);
  }

  async function confirmRemoveConnection() {
    if (!token || !pendingDeleteConnectionId) return;
    const id = pendingDeleteConnectionId;
    setDeletingId(id);
    setError(null);
    try {
      await deleteConnection(id, token);
      await query.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ulanishni o'chirishda xato");
    } finally {
      setDeletingId(null);
      setPendingDeleteConnectionId(null);
    }
  }

  const rows = query.data ?? [];
  const facebookRows = rows.filter((row) => row.provider === "facebook");
  const googleRows = rows.filter((row) => row.provider === "google");
  const connectorActions: Record<Provider, () => Promise<void>> = {
    facebook: connectFacebook,
    google: connectGoogle,
  };

  useEffect(() => {
    if (!token || query.isLoading || formsAutoRefreshStartedRef.current) return;
    if (facebookRows.length === 0) {
      formsAutoRefreshStartedRef.current = true;
      return;
    }

    const hasZeroForms = facebookRows.some((row) => {
      const pages = Array.isArray((row.meta as { pages?: unknown }).pages)
        ? ((row.meta as { pages?: Array<{ forms?: unknown[] }> }).pages ?? [])
        : [];
      if (pages.length === 0) return false;
      return pages.every((page) => !Array.isArray(page.forms) || page.forms.length === 0);
    });

    if (!hasZeroForms) {
      formsAutoRefreshStartedRef.current = true;
      return;
    }

    formsAutoRefreshStartedRef.current = true;
    void (async () => {
      try {
        for (const row of facebookRows) {
          await refreshFacebookConnectionForms(row.id, token);
        }
        await query.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Facebook formalarni yangilashda xato");
      }
    })();
  }, [facebookRows, query, token]);

  if (!ready || query.isLoading) {
    return <PageLoading />;
  }

  return (
    <section className="panel-soft p-5">
      {error ? <p className="mb-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {([
          { provider: "facebook" as const, rows: facebookRows },
          { provider: "google" as const, rows: googleRows },
        ]).map((group) => {
          const ui = PROVIDER_UI[group.provider];
          const Icon = ui.icon;
          const isLoading = loadingProvider === group.provider;
          return (
            <article key={group.provider} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${ui.iconClass}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-[var(--text-primary)]">{ui.title}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {group.rows.length > 0 ? `${group.rows.length} ta profil ulangan` : "Hali ulanmagan"}
                    </p>
                  </div>
                </div>
                <button
                  className="btn-primary"
                  disabled={isLoading}
                  onClick={() => void connectorActions[group.provider]()}
                  type="button"
                >
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <LoadingSpinner size="sm" className="border-[var(--border)] border-t-[var(--surface)]" />
                      Ulanmoqda...
                    </span>
                  ) : "Ulash"}
                </button>
              </div>

              {group.rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--text-secondary)]">
                  Bu manba uchun hozircha profil ulanmagan.
                </div>
              ) : (
                <div className="space-y-2">
                  {group.rows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{row.name}</p>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ui.badge}`}>
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Ulangan
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{getProviderDetails(group.provider, row)}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Ulangan: {new Date(row.created_at).toLocaleString()}</p>
                      </div>
                      <button
                        className="btn-ghost h-9 w-9 px-0 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                        disabled={deletingId === row.id}
                        onClick={() => void removeConnection(row.id)}
                        type="button"
                        title="Ulanishni o'chirish"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <ConfirmDialog
        cancelText="Bekor qilish"
        confirmText="O'chirish"
        loading={Boolean(deletingId && pendingDeleteConnectionId === deletingId)}
        message="Ulanishni o'chirishni tasdiqlaysizmi?"
        onCancel={() => setPendingDeleteConnectionId(null)}
        onConfirm={() => void confirmRemoveConnection()}
        open={Boolean(pendingDeleteConnectionId)}
        title="Ulanishni o'chirish"
      />
    </section>
  );
}

export default function ConnectionsPage() {
  return (
    <QueryBoundary>
      <ConnectionsContent />
    </QueryBoundary>
  );
}



