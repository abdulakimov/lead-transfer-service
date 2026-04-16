"use client";
import { ArrowRight, Trash2, Plus, Zap } from "lucide-react";
import { UiDropdown, type SelectOption } from "./ui-dropdown";

export interface MappingRow {
  id: string;
  sourceField: string;
  destinationField: string;
}

export function newMappingRow(): MappingRow {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `map_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceField: "",
    destinationField: "",
  };
}

export function buildAutoMapping(sourceOptions: SelectOption[], bitrixOptions: SelectOption[]): MappingRow[] {
  const MATCH_MAP: Record<string, string[]> = {
    full_name: ["NAME", "LAST_NAME", "TITLE"],
    phone_number: ["PHONE"],
    email: ["EMAIL"],
    city: ["ADDRESS_CITY", "UF_CRM_CITY"],
    company_name: ["COMPANY_TITLE"],
  };
  const rows: MappingRow[] = [];
  const usedDest = new Set<string>();
  for (const source of sourceOptions) {
    const candidates = MATCH_MAP[source.value] ?? [];
    const match = candidates.find((code) => bitrixOptions.find((b) => b.value === code) && !usedDest.has(code));
    if (match) {
      usedDest.add(match);
      rows.push({
        id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `map_${Date.now()}`,
        sourceField: source.value,
        destinationField: match,
      });
    }
  }
  return rows;
}

export function MappingTable({
  rows, sourceOptions, bitrixOptions, onAdd, onRemove, onUpdate, onAutoMap,
}: {
  rows: MappingRow[];
  sourceOptions: SelectOption[];
  bitrixOptions: SelectOption[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<MappingRow>) => void;
  onAutoMap: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Field Mapping</p>
          <p className="text-xs text-[var(--text-secondary)]">Manba → Bitrix24 maydonlari</p>
        </div>
        <div className="flex items-center gap-2">
          {bitrixOptions.length > 0 && (
            <button className="btn-ghost gap-1.5 text-xs" onClick={onAutoMap} type="button">
              <Zap className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
              Avtomatik
            </button>
          )}
          <button className="btn-primary gap-1.5 text-xs" onClick={onAdd} type="button">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Qo'shish
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center">
          {bitrixOptions.length > 0 && sourceOptions.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">Maydonlar yuklandi. Avtomatik mapping taklif qilinadi.</p>
              <div className="flex justify-center gap-2">
                <button className="btn-primary gap-1.5 text-sm" onClick={onAutoMap} type="button">
                  <Zap className="h-4 w-4" aria-hidden="true" /> Avtomatik to'ldirish
                </button>
                <button className="btn-ghost gap-1.5 text-sm" onClick={onAdd} type="button">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Qo'lda qo'shish
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              {!bitrixOptions.length ? "Avval Maqsad bosqichida Bitrix24 maydonlarini yuklang" : "Manba formasini tanlang"}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_20px_1fr_36px] items-center gap-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Manba</p>
            <span />
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Bitrix24</p>
            <span />
          </div>
          <div className="space-y-2">
            {rows.map((row) => {
              const isIncomplete = !row.sourceField || !row.destinationField;
              return (
                <div
                  key={row.id}
                  className={`animate-slide-down grid grid-cols-[1fr_20px_1fr_36px] items-center gap-2 rounded-xl border p-2 transition-colors ${
                    isIncomplete
                      ? "border-l-2 border-[var(--border)] border-l-[var(--warning)] bg-[var(--surface)]"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  <UiDropdown value={row.sourceField} placeholder="Manba maydoni" options={sourceOptions} onChange={(v) => onUpdate(row.id, { sourceField: v })} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                  <UiDropdown value={row.destinationField} placeholder="Bitrix maydoni" options={bitrixOptions} onChange={(v) => onUpdate(row.id, { destinationField: v })} />
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    onClick={() => onRemove(row.id)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
