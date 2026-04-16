"use client";

import { Check, Loader2 } from "lucide-react";
import { UiDropdown } from "./ui-dropdown";
import { LoadingSpinner } from "@/components/loading-spinner";
import type { ConnectionSummary } from "@/lib/api";

interface GoogleSpreadsheet {
  id: string;
  name: string;
}

export function StepDestination({
  destType,
  destCredentials,
  destCredentialsSet,
  destConnectionId,
  destResourceId,
  destSheetName,
  destFunnelId,
  googleSpreadsheetMode,
  googleCreateSpreadsheetName,
  googleCreateSheetName,
  googleHeaderMode,
  googleSpreadsheetTabs,
  googleSheetMetaLoading,
  bitrixFieldsCount,
  bitrixFieldsLoading,
  bitrixFieldsLoaded,
  bitrixFunnels,
  bitrixFunnelsLoading,
  connections,
  creatingSheet,
  googleCreatedSpreadsheetUrl,
  onDestTypeChange,
  onCredentialsChange,
  onLoadBitrixFields,
  onFunnelChange,
  onConnectionChange,
  onResourceIdChange,
  onSheetNameChange,
  onSpreadsheetModeChange,
  onCreateSpreadsheetNameChange,
  onCreateSheetNameChange,
  onHeaderModeChange,
  onCreateGoogleSheet,
}: {
  destType: "bitrix24" | "amocrm" | "google_sheets";
  destCredentials: string;
  destCredentialsSet?: boolean;
  destConnectionId: string;
  destResourceId: string;
  destSheetName: string;
  destFunnelId: string;
  googleSpreadsheetMode: "existing" | "create";
  googleCreateSpreadsheetName: string;
  googleCreateSheetName: string;
  googleHeaderMode: "default" | "custom" | "none";
  googleSpreadsheetTabs: string[];
  googleSheetMetaLoading: boolean;
  bitrixFieldsCount: number;
  bitrixFieldsLoading: boolean;
  bitrixFieldsLoaded: boolean;
  bitrixFunnels: Array<{ id: string; name: string }>;
  bitrixFunnelsLoading: boolean;
  connections: ConnectionSummary[];
  creatingSheet: boolean;
  googleCreatedSpreadsheetUrl: string;
  onDestTypeChange: (type: "bitrix24" | "amocrm" | "google_sheets") => void;
  onCredentialsChange: (value: string) => void;
  onLoadBitrixFields: () => void;
  onFunnelChange: (id: string) => void;
  onConnectionChange: (id: string) => void;
  onResourceIdChange: (id: string) => void;
  onSheetNameChange: (name: string) => void;
  onSpreadsheetModeChange: (mode: "existing" | "create") => void;
  onCreateSpreadsheetNameChange: (name: string) => void;
  onCreateSheetNameChange: (name: string) => void;
  onHeaderModeChange: (mode: "default" | "custom" | "none") => void;
  onCreateGoogleSheet: () => void;
}) {
  const googleConnections = connections.filter((c) => c.provider === "google");
  const selectedGoogleConnection =
    googleConnections.find((c) => c.id === destConnectionId) ?? null;
  const googleSpreadsheets: GoogleSpreadsheet[] = (
    (
      (selectedGoogleConnection?.meta ?? {}) as {
        spreadsheets?: GoogleSpreadsheet[];
      }
    ).spreadsheets ?? []
  );

  const funnelOptions = bitrixFunnels.map((f) => ({ value: f.id, label: f.name }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Maqsad tanlash</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Lidlar qayerga yuborilasin?
        </p>
      </div>

      {/* Destination type cards */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { type: "bitrix24" as const, title: "Bitrix24", desc: "Webhook URL" },
          { type: "amocrm" as const, title: "AmoCRM", desc: "OAuth 2.0" },
          { type: "google_sheets" as const, title: "Google Sheets", desc: "Jadvalga" },
        ]).map((item) => (
          <button
            key={item.type}
            className={`rounded-2xl border p-4 text-left transition-all ${
              destType === item.type
                ? "border-[var(--brand)] bg-[var(--brand)]/5 shadow-sm"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
            }`}
            onClick={() => onDestTypeChange(item.type)}
            type="button"
          >
            <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{item.desc}</p>
          </button>
        ))}
      </div>

      {/* Bitrix24 config */}
      {destType === "bitrix24" && (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {destCredentialsSet && !destCredentials && (
            <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm text-[var(--warning)]">
              Webhook URL avval saqlangan. O'zgartirish uchun qayta kiriting — bo'sh qoldirsangiz, eski URL saqlanadi.
            </div>
          )}
          <div>
            <label className="label">Bitrix24 Webhook URL</label>
            <input
              className="field"
              placeholder={destCredentialsSet && !destCredentials ? "••••••••••••• (saqlangan)" : "https://yourdomain.bitrix24.ru/rest/1/xxxxx/"}
              value={destCredentials}
              onChange={(e) => onCredentialsChange(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              className="btn-primary gap-1.5"
              disabled={bitrixFieldsLoading || (!destCredentials.trim() && !destCredentialsSet)}
              onClick={onLoadBitrixFields}
              type="button"
            >
              {bitrixFieldsLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Yuklanmoqda...
                </>
              ) : (
                "Maydonlarni yuklash"
              )}
            </button>
            {bitrixFieldsLoaded && (
              <span className="flex items-center gap-1.5 text-sm text-[var(--success)]">
                <Check className="h-4 w-4" aria-hidden="true" />
                {bitrixFieldsCount} ta maydon yuklandi
              </span>
            )}
          </div>

          {/* Funnel selection */}
          {bitrixFieldsLoaded && (
            <div className="animate-slide-down">
              <UiDropdown
                label="Varonka (ixtiyoriy)"
                value={destFunnelId}
                placeholder={
                  bitrixFunnelsLoading
                    ? "Varonkalar yuklanmoqda..."
                    : funnelOptions.length > 0
                      ? "Varonka tanlang"
                      : "Varonkalar topilmadi"
                }
                loading={bitrixFunnelsLoading}
                options={funnelOptions}
                onChange={onFunnelChange}
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Lidlar qaysi varonkaga tushsin
              </p>
            </div>
          )}
        </div>
      )}

      {/* AmoCRM config */}
      {destType === "amocrm" && (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <label className="label">AmoCRM Credentials (JSON)</label>
            <textarea
              className="field min-h-24 resize-y font-mono text-xs"
              placeholder={'{"subdomain":"...","accessToken":"...","refreshToken":"..."}'}
              value={destCredentials}
              onChange={(e) => onCredentialsChange(e.target.value)}
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
            AmoCRM uchun default mapping: full_name → FULL_NAME, phone_number → PHONE, email → EMAIL
          </div>
        </div>
      )}

      {/* Google Sheets config */}
      {destType === "google_sheets" && (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <UiDropdown
            label="Google ulanish"
            value={destConnectionId}
            placeholder="Google profilni tanlang"
            options={googleConnections.map((c) => ({ value: c.id, label: c.name }))}
            onChange={onConnectionChange}
          />

          {destConnectionId && (
            <>
              <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-1 text-sm">
                <button
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    googleSpreadsheetMode === "existing"
                      ? "bg-[var(--surface)] font-medium text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-secondary)]"
                  }`}
                  onClick={() => onSpreadsheetModeChange("existing")}
                  type="button"
                >
                  Mavjudni tanlash
                </button>
                <button
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    googleSpreadsheetMode === "create"
                      ? "bg-[var(--surface)] font-medium text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-secondary)]"
                  }`}
                  onClick={() => onSpreadsheetModeChange("create")}
                  type="button"
                >
                  Yangi yaratish
                </button>
              </div>

              {googleSpreadsheetMode === "existing" ? (
                <div className="space-y-3">
                  <UiDropdown
                    label="Spreadsheet"
                    value={destResourceId}
                    placeholder="Spreadsheet tanlang"
                    options={googleSpreadsheets.map((s) => ({ value: s.id, label: s.name }))}
                    onChange={onResourceIdChange}
                  />
                  {destResourceId && (
                    <UiDropdown
                      label="List (sheet)"
                      value={destSheetName}
                      placeholder={
                        googleSheetMetaLoading ? "Yuklanmoqda..." : "List tanlang"
                      }
                      loading={googleSheetMetaLoading}
                      options={googleSpreadsheetTabs.map((t) => ({ value: t, label: t }))}
                      onChange={onSheetNameChange}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="label">Spreadsheet nomi</label>
                    <input
                      className="field"
                      placeholder="Bo'sh qoldirilsa: LeadFlow Leads"
                      value={googleCreateSpreadsheetName}
                      onChange={(e) => onCreateSpreadsheetNameChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Sheet nomi</label>
                    <input
                      className="field"
                      placeholder="Leads"
                      value={googleCreateSheetName}
                      onChange={(e) => onCreateSheetNameChange(e.target.value)}
                    />
                  </div>
                  <UiDropdown
                    label="Header rejimi"
                    value={googleHeaderMode}
                    placeholder="Rejim tanlang"
                    options={[
                      { value: "default", label: "Default (maydon nomlaridan)" },
                      { value: "custom", label: "Custom (o'zim kiritaman)" },
                      { value: "none", label: "Headersiz" },
                    ]}
                    onChange={(v) =>
                      onHeaderModeChange(v as "default" | "custom" | "none")
                    }
                  />
                  <div className="flex items-center gap-3">
                    <button
                      className="btn-primary gap-1.5"
                      disabled={creatingSheet}
                      onClick={onCreateGoogleSheet}
                      type="button"
                    >
                      {creatingSheet ? (
                        <>
                          <LoadingSpinner size="sm" />
                          Yaratilmoqda...
                        </>
                      ) : (
                        "Jadval yaratish"
                      )}
                    </button>
                    {googleCreatedSpreadsheetUrl && (
                      <a
                        href={googleCreatedSpreadsheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-sm text-[var(--success)]"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Yaratildi — Ochish
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
