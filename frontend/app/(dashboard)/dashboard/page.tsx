"use client";

import { useState } from "react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import { getIntegrations, getLeads } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";

type TimeRange = "24h" | "7d" | "30d";

type LeadSample = {
  source_type: "facebook" | "google_forms";
  status: "pending" | "processing" | "delivered" | "failed" | "dlq" | "duplicate";
  created_at: string;
  delivered_at: string | null;
};

type DashboardMetrics = {
  integrations: number;
  leads: number;
  leadSamples: LeadSample[];
};

function calculateAverageLatencyMs(
  leads: Array<{ created_at: string; delivered_at: string | null; source_type: "facebook" | "google_forms" }>,
  source?: "facebook" | "google_forms",
): { averageMs: number | null; count: number } {
  const samples = leads.filter((lead) => (
    (!source || lead.source_type === source) &&
    Boolean(lead.delivered_at)
  ));

  const latencies = samples
    .map((lead) => {
      const created = new Date(lead.created_at).getTime();
      const delivered = lead.delivered_at ? new Date(lead.delivered_at).getTime() : Number.NaN;
      if (!Number.isFinite(created) || !Number.isFinite(delivered)) return null;
      const diff = delivered - created;
      return diff >= 0 ? diff : null;
    })
    .filter((value): value is number => value !== null);

  if (latencies.length === 0) {
    return { averageMs: null, count: 0 };
  }

  const sum = latencies.reduce((acc, value) => acc + value, 0);
  return { averageMs: Math.round(sum / latencies.length), count: latencies.length };
}

function formatLatency(valueMs: number | null): string {
  if (valueMs === null) return "-";
  if (valueMs < 1000) return `${valueMs} ms`;
  if (valueMs < 60_000) return `${(valueMs / 1000).toFixed(2)} s`;
  const minutes = Math.floor(valueMs / 60_000);
  const seconds = Math.round((valueMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function calculateSuccessRate(
  leads: LeadSample[],
  source?: "facebook" | "google_forms",
): { rate: number | null; total: number; delivered: number } {
  const scoped = source ? leads.filter((lead) => lead.source_type === source) : leads;
  if (scoped.length === 0) return { rate: null, total: 0, delivered: 0 };
  const delivered = scoped.filter((lead) => lead.status === "delivered").length;
  return {
    rate: (delivered / scoped.length) * 100,
    total: scoped.length,
    delivered,
  };
}

function calculateP95LatencyMs(
  leads: LeadSample[],
  source?: "facebook" | "google_forms",
): { p95Ms: number | null; count: number } {
  const scoped = source ? leads.filter((lead) => lead.source_type === source) : leads;
  const latencies = scoped
    .filter((lead) => Boolean(lead.delivered_at))
    .map((lead) => {
      const created = new Date(lead.created_at).getTime();
      const delivered = lead.delivered_at ? new Date(lead.delivered_at).getTime() : Number.NaN;
      if (!Number.isFinite(created) || !Number.isFinite(delivered)) return null;
      const diff = delivered - created;
      return diff >= 0 ? diff : null;
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (latencies.length === 0) {
    return { p95Ms: null, count: 0 };
  }

  const index = Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1);
  return { p95Ms: latencies[index], count: latencies.length };
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
}

function getRangeStart(range: TimeRange): number {
  const now = Date.now();
  if (range === "24h") return now - 24 * 60 * 60 * 1000;
  if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  return now - 30 * 24 * 60 * 60 * 1000;
}

function sourceLabel(source: "facebook" | "google_forms"): string {
  return source === "facebook" ? "Facebook" : "Google Forms";
}

function DashboardContent() {
  const { token, ready } = useAuthToken();
  const [range, setRange] = useState<TimeRange>("7d");
  const query = useApiQuery<DashboardMetrics>(
    ["dashboard-v2", token],
    async () => {
      const accessToken = token!;
      const [integrations, leads] = await Promise.all([
        getIntegrations(accessToken),
        getLeads(accessToken, { limit: 100, offset: 0 }),
      ]);

      return {
        integrations: integrations.length,
        leads: leads.total,
        leadSamples: leads.leads.map((lead) => ({
          source_type: lead.source_type,
          status: lead.status,
          created_at: lead.created_at,
          delivered_at: lead.delivered_at,
        })),
      };
    },
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 12_000 },
  );

  if (!ready || query.isLoading) {
    return <PageLoading />;
  }

  if (!query.data) {
    return <DataPlaceholder title="Hozircha ma'lumot yo'q" description="Lid kelishi uchun integratsiya ulang." />;
  }

  const rangeStart = getRangeStart(range);
  const rangeLeads = query.data.leadSamples.filter((lead) => new Date(lead.created_at).getTime() >= rangeStart);

  const overallAvg = calculateAverageLatencyMs(rangeLeads);
  const fbAvg = calculateAverageLatencyMs(rangeLeads, "facebook");
  const gfAvg = calculateAverageLatencyMs(rangeLeads, "google_forms");
  const overallSuccess = calculateSuccessRate(rangeLeads);
  const fbSuccess = calculateSuccessRate(rangeLeads, "facebook");
  const gfSuccess = calculateSuccessRate(rangeLeads, "google_forms");
  const overallP95 = calculateP95LatencyMs(rangeLeads);
  const statusCounts = {
    delivered: rangeLeads.filter((lead) => lead.status === "delivered").length,
    processing: rangeLeads.filter((lead) => lead.status === "processing" || lead.status === "pending").length,
    failed: rangeLeads.filter((lead) => lead.status === "failed").length,
    dlq: rangeLeads.filter((lead) => lead.status === "dlq").length,
    duplicate: rangeLeads.filter((lead) => lead.status === "duplicate").length,
  };
  const sourceRows: Array<{
    source: "facebook" | "google_forms";
    total: number;
    delivered: number;
    successRate: number | null;
  }> = (["facebook", "google_forms"] as const).map((source) => {
    const scoped = rangeLeads.filter((lead) => lead.source_type === source);
    const delivered = scoped.filter((lead) => lead.status === "delivered").length;
    return {
      source,
      total: scoped.length,
      delivered,
      successRate: scoped.length ? (delivered / scoped.length) * 100 : null,
    };
  });

  return (
    <>
      <section className="mb-3 flex items-center justify-end gap-2">
        {(["24h", "7d", "30d"] as const).map((key) => (
          <button
            key={key}
            className={range === key ? "btn-primary h-9" : "btn-ghost h-9"}
            onClick={() => setRange(key)}
            type="button"
          >
            {key}
          </button>
        ))}
      </section>

      <section className="panel p-3 sm:p-4">
        <div className="grid gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Jami lidlar</p>
            <p className="mt-1 text-3xl font-semibold leading-none text-[var(--text-primary)]">{rangeLeads.length.toLocaleString()}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Davr: {range}</p>
          </article>
          <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Success rate (umumiy)</p>
            <p className="mt-1 text-3xl font-semibold leading-none text-[var(--text-primary)]">{formatPercent(overallSuccess.rate)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Delivered {overallSuccess.delivered}/{overallSuccess.total}</p>
          </article>
          <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">P95 yetkazish vaqti</p>
            <p className="mt-1 text-3xl font-semibold leading-none text-[var(--text-primary)]">{formatLatency(overallP95.p95Ms)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Sample: {overallP95.count} ta delivered</p>
          </article>
          <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">O'rtacha tezlik (umumiy)</p>
            <p className="mt-1 text-3xl font-semibold leading-none text-[var(--text-primary)]">{formatLatency(overallAvg.averageMs)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Sample: {overallAvg.count} ta delivered</p>
          </article>
          <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Facebook</p>
            <p className="mt-1 text-3xl font-semibold leading-none text-[var(--text-primary)]">{formatLatency(fbAvg.averageMs)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Success {formatPercent(fbSuccess.rate)} ({fbSuccess.delivered}/{fbSuccess.total})</p>
          </article>
          <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Google Forms</p>
            <p className="mt-1 text-3xl font-semibold leading-none text-[var(--text-primary)]">{formatLatency(gfAvg.averageMs)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Success {formatPercent(gfSuccess.rate)} ({gfSuccess.delivered}/{gfSuccess.total})</p>
          </article>
        </div>
      </section>

      <section className="mt-4">
        <article className="panel p-5">
          <div className="mb-3">
            <div>
              <p className="text-sm font-medium">Holat bo'yicha taqsimot</p>
              <p className="text-xs text-[var(--text-secondary)]">Tanlangan davr bo'yicha lead holati va source kesimidagi natija.</p>
            </div>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--info-border)", background: "var(--info-soft)" }}>
              <p className="text-[11px]" style={{ color: "var(--info)" }}>Bajarildi</p>
              <p className="text-xl font-semibold" style={{ color: "var(--info)" }}>{statusCounts.delivered}</p>
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--brand-soft)", background: "var(--surface-soft)" }}>
              <p className="text-[11px]" style={{ color: "var(--brand)" }}>Jarayonda</p>
              <p className="text-xl font-semibold" style={{ color: "var(--brand)" }}>{statusCounts.processing}</p>
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--danger-border)", background: "var(--danger-soft)" }}>
              <p className="text-[11px]" style={{ color: "var(--danger)" }}>Xato</p>
              <p className="text-xl font-semibold" style={{ color: "var(--danger)" }}>{statusCounts.failed}</p>
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--danger-border)", background: "var(--danger-soft)" }}>
              <p className="text-[11px]" style={{ color: "var(--danger)" }}>DLQ</p>
              <p className="text-xl font-semibold" style={{ color: "var(--danger)" }}>{statusCounts.dlq}</p>
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--warning-border)", background: "var(--warning-soft)" }}>
              <p className="text-[11px]" style={{ color: "var(--warning)" }}>Dublikat</p>
              <p className="text-xl font-semibold" style={{ color: "var(--warning)" }}>{statusCounts.duplicate}</p>
            </div>
          </div>

          <div className="table-shell">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Jami</th>
                  <th className="px-3 py-3">Delivered</th>
                  <th className="px-3 py-3">Success rate</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.every((row) => row.total === 0) ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-[var(--text-secondary)]" colSpan={4}>Tanlangan davrda source ma'lumotlari yo'q</td>
                  </tr>
                ) : (
                  sourceRows.map((row) => (
                    <tr key={row.source} className="table-row">
                      <td className="px-3 py-3 font-medium text-[var(--text-primary)]">{sourceLabel(row.source)}</td>
                      <td className="px-3 py-3">{row.total}</td>
                      <td className="px-3 py-3">{row.delivered}</td>
                      <td className="px-3 py-3">{formatPercent(row.successRate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <QueryBoundary>
        <DashboardContent />
      </QueryBoundary>
    </div>
  );
}
