"use client";

import { DataPlaceholder } from "@/components/data-placeholder";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import { StatusPill } from "@/components/status-pill";
import { getLeadById, getLeads, retryLead } from "@/lib/api";
import type { Lead, LeadDetail, LeadsResponse } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FilterX,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 25;

type SortKey = "created_at" | "attempts" | "latency";
type SortDirection = "asc" | "desc";

type ColumnKey =
  | "index"
  | "leadgen"
  | "correlation"
  | "source"
  | "status"
  | "integration"
  | "crm_lead_id"
  | "attempts"
  | "delivered_at"
  | "latency"
  | "updated_at"
  | "actions";

interface SelectOption {
  value: string;
  label: string;
}

type VisibleColumns = Record<ColumnKey, boolean>;

const DEFAULT_COLUMNS: VisibleColumns = {
  index: true,
  leadgen: true,
  correlation: true,
  source: true,
  status: true,
  integration: true,
  crm_lead_id: true,
  attempts: true,
  delivered_at: true,
  latency: true,
  updated_at: true,
  actions: true,
};

function UiDropdown({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onChange: (nextValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="relative min-w-0">
      <label className="mb-1 block text-xs text-[var(--text-secondary)]">{label}</label>
      <button
        className="field flex h-10 items-center justify-between text-left"
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
      </button>
      {open ? (
        <div className="scrollbar-ui absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          {options.map((option) => (
            <button
              key={option.value}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-soft)] ${
                value === option.value ? "bg-[var(--surface-soft)] font-medium text-[var(--text-primary)]" : "text-[var(--text-primary)]"
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDeliveryLatency(createdAt: string, deliveredAt: string | null): number | null {
  if (!deliveredAt) return null;
  const createdMs = new Date(createdAt).getTime();
  const deliveredMs = new Date(deliveredAt).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(deliveredMs)) return null;
  const diff = deliveredMs - createdMs;
  if (diff < 0) return null;
  return diff;
}

function formatLatencyLabel(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function compactLeadgenId(value: string): string {
  if (value.length <= 22) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function compactCorrelationId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatSourceType(value: Lead["source_type"]): string {
  return value === "google_forms" ? "Google Forms" : "Facebook";
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "-";
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "hozir";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "hozir";
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  return `${days} kun oldin`;
}

function rowClassByStatus(status: Lead["status"]): string {
  if (status === "failed" || status === "dlq") return "bg-[var(--danger-soft)]";
  if (status === "duplicate") return "bg-[var(--warning-soft)]";
  if (status === "processing") return "bg-[var(--info-soft)]";
  return "";
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // no-op: clipboard API may be unavailable
  }
}

function toCsvValue(input: string): string {
  const escaped = input.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function LeadsContent() {
  const { token, ready } = useAuthToken();
  const [page, setPage] = useState(1);
  const [queryText, setQueryText] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | Lead["source_type"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Lead["status"]>("all");
  const [integrationFilter, setIntegrationFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(DEFAULT_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [selectedLeadLoading, setSelectedLeadLoading] = useState(false);
  const [selectedLeadError, setSelectedLeadError] = useState<string | null>(null);
  const [retryingLeadId, setRetryingLeadId] = useState<string | null>(null);

  const offset = (page - 1) * PAGE_SIZE;
  const query = useApiQuery<LeadsResponse>(
    ["leads-v4", token, page, PAGE_SIZE],
    async () => getLeads(token!, { limit: PAGE_SIZE, offset }),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 10_000 },
  );

  const leads = query.data?.leads ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const integrationOptions = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.integration_name))).sort((a, b) => a.localeCompare(b)),
    [leads],
  );

  const sourceOptions = useMemo<SelectOption[]>(
    () => [
      { value: "all", label: "Barchasi" },
      { value: "facebook", label: "Facebook" },
      { value: "google_forms", label: "Google Forms" },
    ],
    [],
  );
  const statusOptions = useMemo<SelectOption[]>(
    () => [
      { value: "all", label: "Barchasi" },
      { value: "pending", label: "pending" },
      { value: "processing", label: "processing" },
      { value: "delivered", label: "delivered" },
      { value: "failed", label: "failed" },
      { value: "dlq", label: "dlq" },
      { value: "duplicate", label: "duplicate" },
    ],
    [],
  );
  const integrationFilterOptions = useMemo<SelectOption[]>(
    () => [
      { value: "all", label: "Barchasi" },
      ...integrationOptions.map((integrationName) => ({ value: integrationName, label: integrationName })),
    ],
    [integrationOptions],
  );
  const sortKeyOptions = useMemo<SelectOption[]>(
    () => [
      { value: "created_at", label: "Yaratilgan vaqt" },
      { value: "attempts", label: "Urinishlar" },
      { value: "latency", label: "Yetkazish vaqti" },
    ],
    [],
  );
  const sortDirectionOptions = useMemo<SelectOption[]>(
    () => [
      { value: "desc", label: "Kamayish" },
      { value: "asc", label: "O'sish" },
    ],
    [],
  );

  const filteredLeads = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return leads.filter((lead) => {
      if (sourceFilter !== "all" && lead.source_type !== sourceFilter) return false;
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (integrationFilter !== "all" && lead.integration_name !== integrationFilter) return false;
      if (!needle) return true;
      const haystack = [
        lead.leadgen_id,
        lead.id,
        lead.integration_name,
        lead.crm_lead_id ?? "",
        formatSourceType(lead.source_type),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [leads, sourceFilter, statusFilter, integrationFilter, queryText]);

  const sortedLeads = useMemo(() => {
    const sorted = [...filteredLeads];
    sorted.sort((a, b) => {
      let compare = 0;
      if (sortKey === "attempts") {
        compare = a.attempts - b.attempts;
      } else if (sortKey === "latency") {
        const aLatency = formatDeliveryLatency(a.created_at, a.delivered_at) ?? Number.POSITIVE_INFINITY;
        const bLatency = formatDeliveryLatency(b.created_at, b.delivered_at) ?? Number.POSITIVE_INFINITY;
        compare = aLatency - bLatency;
      } else {
        compare = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDirection === "asc" ? compare : -compare;
    });
    return sorted;
  }, [filteredLeads, sortDirection, sortKey]);

  useEffect(() => {
    if (!selectedLeadId || !token) return;
    let cancelled = false;
    setSelectedLeadLoading(true);
    setSelectedLeadError(null);
    void getLeadById(selectedLeadId, token)
      .then((payload) => {
        if (cancelled) return;
        setSelectedLead(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setSelectedLeadError(err instanceof Error ? err.message : "Lead tafsilotlarini olishda xato");
      })
      .finally(() => {
        if (!cancelled) setSelectedLeadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLeadId, token]);

  function resetFilters() {
    setQueryText("");
    setSourceFilter("all");
    setStatusFilter("all");
    setIntegrationFilter("all");
  }

  function toggleColumn(column: ColumnKey) {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  }

  async function onRetryLead(lead: Lead) {
    if (!token) return;
    if (!(lead.status === "failed" || lead.status === "dlq")) return;
    setRetryingLeadId(lead.id);
    try {
      await retryLead(lead.id, token);
      await query.refetch();
    } finally {
      setRetryingLeadId(null);
    }
  }

  function exportCsv() {
    const rows = sortedLeads;
    const headers = [
      "Lead ID",
      "Leadgen ID",
      "Source",
      "Status",
      "Integration",
      "CRM Lead ID",
      "Attempts",
      "Delivered At",
      "Latency(ms)",
      "Updated At",
    ];
    const lines = [
      headers.map(toCsvValue).join(","),
      ...rows.map((lead) => [
        lead.id,
        lead.leadgen_id,
        formatSourceType(lead.source_type),
        lead.status,
        lead.integration_name,
        lead.crm_lead_id ?? "",
        String(lead.attempts),
        lead.delivered_at ?? "",
        String(formatDeliveryLatency(lead.created_at, lead.delivered_at) ?? ""),
        lead.updated_at,
      ].map(toCsvValue).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyDebugBundle() {
    if (!selectedLead) return;
    const payload = {
      correlation_id: selectedLead.id,
      leadgen_id: selectedLead.leadgen_id,
      status: selectedLead.status,
      attempts: selectedLead.attempts,
      integration: selectedLead.integration_name,
      source: selectedLead.source_type,
      last_error: selectedLead.last_error,
      created_at: selectedLead.created_at,
      updated_at: selectedLead.updated_at,
      delivered_at: selectedLead.delivered_at,
      raw_data: selectedLead.raw_data,
      mapped_data: selectedLead.mapped_data,
    };
    await copyText(JSON.stringify(payload, null, 2));
  }

  if (!ready || query.isLoading) {
    return <PageLoading />;
  }

  if (leads.length === 0) {
    return <DataPlaceholder title="Hali lid yo'q" description="Webhook ma'lumot olgach, barcha lidlar shu yerda ko'rinadi." />;
  }

  return (
    <section className="panel-soft p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => void query.refetch()} type="button">
            {query.isRefreshing ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Yangilanmoqda...
              </span>
            ) : (
              <>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Yangilash
              </>
            )}
          </button>
          <button className="btn-ghost" onClick={exportCsv} type="button">
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--text-secondary)] xl:col-span-2">
          Qidiruv
          <input
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] outline-none ring-0 placeholder:text-[var(--text-secondary)] focus:border-[var(--brand-soft)]"
            onChange={(event) => setQueryText(event.target.value)}
            placeholder="leadgen / integratsiya / CRM ID"
            value={queryText}
          />
        </label>
        <UiDropdown
          label="Manba"
          onChange={(nextValue) => setSourceFilter(nextValue as "all" | Lead["source_type"])}
          options={sourceOptions}
          placeholder="Manba tanlang"
          value={sourceFilter}
        />
        <UiDropdown
          label="Holat"
          onChange={(nextValue) => setStatusFilter(nextValue as "all" | Lead["status"])}
          options={statusOptions}
          placeholder="Holat tanlang"
          value={statusFilter}
        />
        <UiDropdown
          label="Integratsiya"
          onChange={setIntegrationFilter}
          options={integrationFilterOptions}
          placeholder="Integratsiya tanlang"
          value={integrationFilter}
        />
        <UiDropdown
          label="Sort"
          onChange={(nextValue) => setSortKey(nextValue as SortKey)}
          options={sortKeyOptions}
          placeholder="Sort"
          value={sortKey}
        />
        <UiDropdown
          label="Yo'nalish"
          onChange={(nextValue) => setSortDirection(nextValue as SortDirection)}
          options={sortDirectionOptions}
          placeholder="Yo'nalish"
          value={sortDirection}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <button className="btn-ghost" onClick={resetFilters} type="button">
          <FilterX className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Filterni tozalash
        </button>
        <div className="relative">
          <button className="btn-ghost" onClick={() => setColumnsOpen((prev) => !prev)} type="button">
            <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Ustunlar
          </button>
          {columnsOpen ? (
            <>
              <button
                aria-label="Ustunlar menyusini yopish"
                className="fixed inset-0 z-10 cursor-default bg-transparent"
                onClick={() => setColumnsOpen(false)}
                type="button"
              />
              <div className="absolute right-0 z-20 mt-1 min-w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                {(Object.keys(DEFAULT_COLUMNS) as ColumnKey[]).map((column) => (
                  <button
                    key={column}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-soft)] ${
                      visibleColumns[column] ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                    }`}
                    onClick={() => toggleColumn(column)}
                    type="button"
                  >
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                        visibleColumns[column] ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--border)] bg-[var(--surface)]"
                      }`}
                    >
                      {visibleColumns[column] ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    </span>
                    <span className="text-[var(--text-primary)]">{column}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="table-shell">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="table-head">
              {visibleColumns.index ? <th className="px-3 py-3">#</th> : null}
              {visibleColumns.leadgen ? <th className="px-3 py-3">Leadgen</th> : null}
              {visibleColumns.correlation ? <th className="px-3 py-3">Correlation</th> : null}
              {visibleColumns.source ? <th className="px-3 py-3">Manba</th> : null}
              {visibleColumns.status ? <th className="px-3 py-3">Holat</th> : null}
              {visibleColumns.integration ? <th className="px-3 py-3">Integratsiya</th> : null}
              {visibleColumns.crm_lead_id ? <th className="px-3 py-3">CRM Lead ID</th> : null}
              {visibleColumns.attempts ? <th className="px-3 py-3">Urinishlar</th> : null}
              {visibleColumns.delivered_at ? <th className="px-3 py-3">Yetkazildi</th> : null}
              {visibleColumns.latency ? <th className="px-3 py-3">Yetkazish vaqti</th> : null}
              {visibleColumns.updated_at ? <th className="px-3 py-3">Yangilangan</th> : null}
              {visibleColumns.actions ? <th className="px-3 py-3 text-right">Amallar</th> : null}
            </tr>
          </thead>
          <tbody>
            {sortedLeads.map((lead, index) => (
              <tr
                key={lead.id}
                className={`table-row cursor-pointer ${rowClassByStatus(lead.status)}`}
                onClick={() => setSelectedLeadId(lead.id)}
              >
                {visibleColumns.index ? <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{offset + index + 1}</td> : null}
                {visibleColumns.leadgen ? (
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="max-w-[210px] truncate font-mono text-[11px] text-[var(--text-secondary)]" title={lead.leadgen_id}>
                        {compactLeadgenId(lead.leadgen_id)}
                      </span>
                      <button
                        className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyText(lead.leadgen_id);
                        }}
                        title="Leadgen ID nusxalash"
                        type="button"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                ) : null}
                {visibleColumns.correlation ? (
                  <td className="px-3 py-3 font-mono text-[11px] text-[var(--text-secondary)]" title={lead.id}>
                    {compactCorrelationId(lead.id)}
                  </td>
                ) : null}
                {visibleColumns.source ? <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{formatSourceType(lead.source_type)}</td> : null}
                {visibleColumns.status ? <td className="px-3 py-3"><StatusPill status={lead.status} /></td> : null}
                {visibleColumns.integration ? <td className="px-3 py-3">{lead.integration_name}</td> : null}
                {visibleColumns.crm_lead_id ? <td className="px-3 py-3 font-mono text-xs text-[var(--text-secondary)]">{lead.crm_lead_id ?? "-"}</td> : null}
                {visibleColumns.attempts ? <td className="px-3 py-3">{lead.attempts}</td> : null}
                {visibleColumns.delivered_at ? (
                  <td className="px-3 py-3 text-xs text-[var(--text-secondary)]" title={lead.delivered_at ? new Date(lead.delivered_at).toLocaleString() : "-"}>
                    {lead.delivered_at ? formatRelativeTime(lead.delivered_at) : "-"}
                  </td>
                ) : null}
                {visibleColumns.latency ? (
                  <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{formatLatencyLabel(formatDeliveryLatency(lead.created_at, lead.delivered_at))}</td>
                ) : null}
                {visibleColumns.updated_at ? (
                  <td className="px-3 py-3 text-xs text-[var(--text-secondary)]" title={new Date(lead.updated_at).toLocaleString()}>
                    {formatRelativeTime(lead.updated_at)}
                  </td>
                ) : null}
                {visibleColumns.actions ? (
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="btn-ghost h-8 px-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedLeadId(lead.id);
                        }}
                        title="Tafsilotlar"
                        type="button"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {lead.status === "failed" || lead.status === "dlq" ? (
                        <button
                          className="btn-ghost h-8 px-2 text-[var(--success)] hover:bg-[var(--surface-soft)]"
                          disabled={retryingLeadId === lead.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onRetryLead(lead);
                          }}
                          title="Qayta yuborish"
                          type="button"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {sortedLeads.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]" colSpan={12}>
                  Filter bo'yicha ma'lumot topilmadi.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
        <span>Filterdan topildi: {sortedLeads.length}</span>
        <span>Jami lidlar: {total}</span>
        <span>Sahifa: {page}/{totalPages}</span>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          aria-label="Oldingi sahifa"
          className="btn-ghost h-9 w-9 px-0"
          disabled={page <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          title="Oldingi"
          type="button"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          aria-label="Keyingi sahifa"
          className="btn-ghost h-9 w-9 px-0"
          disabled={page >= totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          title="Keyingi"
          type="button"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {selectedLeadId ? (
        <div className="fixed inset-0 z-[65]">
          <button
            aria-label="Lead tafsilotlarini yopish"
            className="absolute inset-0 bg-black/20"
            onClick={() => setSelectedLeadId(null)}
            type="button"
          />
          <div className="absolute inset-y-0 right-0 z-10 w-full max-w-xl border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Lead tafsilotlari</p>
                <p className="text-xs text-[var(--text-secondary)]">Correlation ID: {selectedLeadId}</p>
              </div>
              <button className="btn-ghost h-9 w-9 px-0" onClick={() => setSelectedLeadId(null)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-ui h-[calc(100%-58px)] overflow-auto p-4">
              {selectedLeadLoading ? (
                <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <LoadingSpinner size="sm" />
                  <span>Yuklanmoqda...</span>
                </p>
              ) : null}
              {selectedLeadError ? <p className="text-sm text-[var(--danger)]">{selectedLeadError}</p> : null}
              {selectedLead ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm">
                    <p><strong>Status:</strong> {selectedLead.status}</p>
                    <p><strong>Urinish:</strong> {selectedLead.attempts}</p>
                    <p><strong>Integratsiya:</strong> {selectedLead.integration_name}</p>
                    <p><strong>Manba:</strong> {formatSourceType(selectedLead.source_type)}</p>
                    <p><strong>Leadgen:</strong> {selectedLead.leadgen_id}</p>
                    <p><strong>CRM Lead ID:</strong> {selectedLead.crm_lead_id ?? "-"}</p>
                    <p><strong>Oxirgi xato:</strong> {selectedLead.last_error ?? "-"}</p>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] p-3">
                    <p className="mb-2 text-sm font-semibold">Timeline</p>
                    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                      <li>Qabul qilindi: {new Date(selectedLead.created_at).toLocaleString()}</li>
                      <li>Yangilandi: {new Date(selectedLead.updated_at).toLocaleString()}</li>
                      <li>Yetkazildi: {selectedLead.delivered_at ? new Date(selectedLead.delivered_at).toLocaleString() : "-"}</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Debug bundle</p>
                      <button className="btn-ghost h-8" onClick={() => void copyDebugBundle()} type="button">
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Nusxalash
                      </button>
                    </div>
                    <pre className="scrollbar-ui max-h-80 overflow-auto rounded-lg bg-[var(--shell)] p-3 text-[11px] text-[var(--text-primary)]">
                      {JSON.stringify({
                        correlation_id: selectedLead.id,
                        leadgen_id: selectedLead.leadgen_id,
                        raw_data: selectedLead.raw_data,
                        mapped_data: selectedLead.mapped_data,
                      }, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function LeadsPage() {
  return (
    <QueryBoundary>
      <LeadsContent />
    </QueryBoundary>
  );
}

