"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import {
  getConnections,
  getIntegrations,
  getLeadsStatsSummary,
  toggleIntegration,
  type ConnectionSummary,
} from "@/lib/api";
import type { Integration } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import bitrixIcon from "@/asstes/icons/bitrix.png";
import amocrmIcon from "@/asstes/icons/amocrm.png";
import formsIcon from "@/asstes/icons/forms.webp";
import metaIcon from "@/asstes/icons/meta.webp";
import sheetsIcon from "@/asstes/icons/sheets.png";

function formatIntegrationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const months = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
  return `${date.getDate()}-${months[date.getMonth()] ?? ""}, ${date.getFullYear()}`;
}

function IntegrationCard({
  row,
  transactionCount,
  onClick,
  onToggle,
}: {
  row: Integration;
  transactionCount: number;
  onClick: () => void;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const sourceVisual = {
    facebook: { label: "Meta Ads", icon: metaIcon, tone: "bg-[var(--info-soft)]" },
    google_forms: { label: "Google Forms", icon: formsIcon, tone: "bg-[var(--brand-soft)]" },
  }[row.source_type as "facebook" | "google_forms"] ?? { label: row.source_type, icon: formsIcon, tone: "bg-[var(--surface-soft)]" };

  const destVisual = {
    bitrix24: { label: "Bitrix24", icon: bitrixIcon, tone: "bg-[var(--info-soft)]" },
    amocrm: { label: "AmoCRM", icon: amocrmIcon, tone: "bg-[var(--surface-soft)]" },
    google_sheets: { label: "Google Sheets", icon: sheetsIcon, tone: "bg-[var(--success-soft)]" },
  }[row.dest_type as "bitrix24" | "amocrm" | "google_sheets"] ?? { label: row.dest_type, icon: sheetsIcon, tone: "bg-[var(--surface-soft)]" };

  return (
    <div
      className="flex w-[320px] max-w-full cursor-pointer flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left shadow-sm transition-shadow hover:shadow-md"
      onClick={onClick}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[18px] font-semibold leading-6 text-[var(--text-primary)]">
          {row.name}
        </p>
        <button
          className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full transition-opacity hover:opacity-70 ${row.active ? "bg-[var(--success)]" : "bg-[var(--text-secondary)]"}`}
          aria-label={row.active ? "Faol — o'chirish uchun bosing" : "Nofaol — yoqish uchun bosing"}
          onClick={onToggle}
          type="button"
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${sourceVisual.tone}`}>
              <Image alt={sourceVisual.label} className="h-5 w-5 object-contain" src={sourceVisual.icon} />
            </span>
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">{sourceVisual.label}</p>
          </div>
          <span className="text-xs font-semibold text-[var(--text-secondary)]">→</span>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">{destVisual.label}</p>
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${destVisual.tone}`}>
              <Image alt={destVisual.label} className="h-5 w-5 object-contain" src={destVisual.icon} />
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)]">
        <div>
          <p>Tranzaksiyalar</p>
          <p className="text-xs font-medium text-[var(--text-primary)]">{transactionCount} ta</p>
        </div>
        <div className="text-right">
          <p>Yaratilgan</p>
          <p className="text-xs font-medium text-[var(--text-primary)]">{formatIntegrationDate(row.created_at)}</p>
        </div>
      </div>
    </div>
  );
}

function IntegrationsContent() {
  const router = useRouter();
  const { token, ready } = useAuthToken();

  const integrationsQuery = useApiQuery<Integration[]>(
    ["integrations-v5", token],
    () => getIntegrations(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 20_000 },
  );

  const connectionsQuery = useApiQuery<ConnectionSummary[]>(
    ["connections-v1", token],
    () => getConnections(token!),
    { enabled: ready && Boolean(token), throwOnError: false, staleMs: 15_000 },
  );

  const statsSummaryQuery = useApiQuery<Array<{ integration_id: string; total: number }>>(
    ["leads-stats-summary-v1", token],
    () => getLeadsStatsSummary(token!),
    { enabled: ready && Boolean(token), throwOnError: false, staleMs: 20_000 },
  );

  const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");
  const [toggling, setToggling] = useState<string | null>(null);

  const rows = integrationsQuery.data ?? [];
  const activeRows = rows.filter((r) => r.active);
  const inactiveRows = rows.filter((r) => !r.active);
  const visibleRows = activeTab === "active" ? activeRows : inactiveRows;

  const transactionMap = new Map(
    (statsSummaryQuery.data ?? []).map((item) => [item.integration_id, Number(item.total) || 0]),
  );

  async function handleToggle(row: Integration, e: React.MouseEvent) {
    e.stopPropagation();
    if (!token || toggling) return;
    setToggling(row.id);
    try {
      await toggleIntegration(row.id, token);
      await integrationsQuery.refetch();
    } finally {
      setToggling(null);
    }
  }

  if (!ready || integrationsQuery.isLoading) return <PageLoading />;

  return (
    <section className="panel-soft p-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Integratsiyalar</h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Meta Ads va Google Forms dan CRM ga lid o'tkazish
          </p>
        </div>
        <button
          className="btn-primary gap-2"
          onClick={() => router.push("/integrations/new")}
          type="button"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Yangi integratsiya
        </button>
      </div>

      {rows.length === 0 ? (
        <DataPlaceholder
          title="Hali integratsiya yo'q"
          description="'Yangi integratsiya' tugmasini bosib birinchi integratsiyani yarating."
        />
      ) : (
        <div className="space-y-5">
          {/* Tabs */}
          <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
            {(["active", "inactive"] as const).map((tab) => {
              const count = tab === "active" ? activeRows.length : inactiveRows.length;
              const label = tab === "active" ? "Faol" : "Tugatilgan";
              return (
                <button
                  key={tab}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-[var(--surface-soft)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Cards grid */}
          {visibleRows.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleRows.map((row) => (
                <IntegrationCard
                  key={row.id}
                  row={row}
                  transactionCount={transactionMap.get(row.id) ?? 0}
                  onClick={() => router.push(`/integrations/${row.id}`)}
                  onToggle={(e) => void handleToggle(row, e)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
              {activeTab === "active" ? "Hozircha faol integratsiya yo'q." : "Tugatilgan integratsiyalar yo'q."}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function IntegrationsPage() {
  return (
    <QueryBoundary>
      <IntegrationsContent />
    </QueryBoundary>
  );
}
