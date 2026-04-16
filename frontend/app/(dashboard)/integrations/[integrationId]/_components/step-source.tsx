"use client";
import { UiDropdown } from "./ui-dropdown";
import type { ConnectionSummary, GoogleFormOption } from "@/lib/api";

export function StepSource({
  sourceType, sourceConnectionId, sourcePageId, sourceFormId,
  connections, googleForms, googleFormsLoading,
  onSourceTypeChange, onConnectionChange, onPageChange, onFormChange,
}: {
  sourceType: "facebook" | "google_forms";
  sourceConnectionId: string;
  sourcePageId: string;
  sourceFormId: string;
  connections: ConnectionSummary[];
  googleForms: GoogleFormOption[];
  googleFormsLoading: boolean;
  onSourceTypeChange: (type: "facebook" | "google_forms") => void;
  onConnectionChange: (id: string) => void;
  onPageChange: (id: string) => void;
  onFormChange: (id: string) => void;
}) {
  const facebookConnections = connections.filter((c) => c.provider === "facebook");
  const googleConnections = connections.filter((c) => c.provider === "google");
  const selectedFbConn = facebookConnections.find((c) => c.id === sourceConnectionId) ?? null;
  const sourcePages = (((selectedFbConn?.meta ?? {}) as { pages?: Array<{ id: string; name: string; forms?: Array<{ id: string; name: string }> }> }).pages ?? []);
  const selectedPage = sourcePages.find((p) => p.id === sourcePageId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Manba tanlash</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Lidlar qayerdan kelasin?</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([
          { type: "facebook" as const, title: "Meta Ads", desc: "Facebook Lead Ads" },
          { type: "google_forms" as const, title: "Google Forms", desc: "Form submit orqali" },
        ]).map((item) => (
          <button
            key={item.type}
            className={`rounded-2xl border p-4 text-left transition-all ${
              sourceType === item.type
                ? "border-[var(--brand)] bg-[var(--brand)]/5 shadow-sm"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
            }`}
            onClick={() => onSourceTypeChange(item.type)}
            type="button"
          >
            <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{item.desc}</p>
          </button>
        ))}
      </div>

      {sourceType === "facebook" ? (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <UiDropdown
            label="Facebook ulanish"
            value={sourceConnectionId}
            placeholder="Ulanishni tanlang"
            options={facebookConnections.map((c) => ({ value: c.id, label: c.name }))}
            onChange={onConnectionChange}
          />
          {sourceConnectionId && (
            <UiDropdown
              label="Facebook sahifasi"
              value={sourcePageId}
              placeholder="Sahifani tanlang"
              options={sourcePages.map((p) => ({ value: p.id, label: p.name }))}
              onChange={onPageChange}
            />
          )}
          {sourcePageId && (
            <UiDropdown
              label="Lead forma (ixtiyoriy)"
              value={sourceFormId}
              placeholder="Any form — barcha formalar"
              options={(selectedPage?.forms ?? []).map((f) => ({ value: f.id, label: f.name }))}
              onChange={onFormChange}
            />
          )}
          {sourceConnectionId && (
            <div className="rounded-xl border border-[var(--success-border)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]">
              Ulangan: {facebookConnections.find((c) => c.id === sourceConnectionId)?.name ?? sourceConnectionId} ✓
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <UiDropdown
            label="Google ulanish"
            value={sourceConnectionId}
            placeholder="Google profilni tanlang"
            options={googleConnections.map((c) => ({ value: c.id, label: c.name }))}
            onChange={onConnectionChange}
          />
          {sourceConnectionId && (
            <UiDropdown
              label="Google forma"
              value={sourceFormId}
              placeholder={googleFormsLoading ? "Formalar yuklanmoqda..." : "Formani tanlang"}
              loading={googleFormsLoading}
              options={googleForms.map((f) => ({ value: f.id, label: f.name }))}
              onChange={onFormChange}
            />
          )}
          {sourceConnectionId && (
            <div className="rounded-xl border border-[var(--success-border)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]">
              Ulangan: {googleConnections.find((c) => c.id === sourceConnectionId)?.name ?? sourceConnectionId} ✓
            </div>
          )}
        </div>
      )}
    </div>
  );
}
