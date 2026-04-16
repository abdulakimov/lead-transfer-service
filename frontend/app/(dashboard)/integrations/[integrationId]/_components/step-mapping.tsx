"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import type { BitrixLeadField, FacebookSourceField } from "@/lib/api";
import { MappingTable, buildAutoMapping, newMappingRow, type MappingRow } from "./mapping-table";
import type { SelectOption } from "./ui-dropdown";

const DEFAULT_SOURCE_OPTIONS: SelectOption[] = [
  { value: "full_name", label: "Full Name" },
  { value: "phone_number", label: "Phone Number" },
  { value: "email", label: "Email" },
  { value: "city", label: "City" },
  { value: "company_name", label: "Company Name" },
];

export function StepMapping({
  destType,
  sourceFields,
  sourceFieldsLoading,
  sourceFieldsError,
  bitrixFields,
  mappingRows,
  onMappingRowsReplace,
  onMappingRowAdd,
  onMappingRowRemove,
  onMappingRowUpdate,
}: {
  destType: "bitrix24" | "amocrm" | "google_sheets";
  sourceFields: FacebookSourceField[];
  sourceFieldsLoading: boolean;
  sourceFieldsError: string | null;
  bitrixFields: BitrixLeadField[];
  mappingRows: MappingRow[];
  onMappingRowsReplace: (rows: MappingRow[]) => void;
  onMappingRowAdd: () => void;
  onMappingRowRemove: (id: string) => void;
  onMappingRowUpdate: (id: string, patch: Partial<MappingRow>) => void;
}) {
  const sourceOptions: SelectOption[] =
    sourceFields.length > 0
      ? sourceFields.map((f) => ({ value: f.key, label: f.label }))
      : DEFAULT_SOURCE_OPTIONS;

  const bitrixOptions: SelectOption[] = bitrixFields.map((f) => ({
    value: f.code,
    label: f.title,
    sublabel: `(${f.code})`,
  }));

  function handleAutoMap() {
    const autoRows = buildAutoMapping(sourceOptions, bitrixOptions);
    if (autoRows.length > 0) {
      onMappingRowsReplace(autoRows);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Field Mapping</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Manba maydonlarini maqsad tizimiga bog'lang.
        </p>
      </div>

      {sourceFieldsLoading && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
          <LoadingSpinner size="sm" />
          <span>Manba forma maydonlari yuklanmoqda...</span>
        </div>
      )}

      {sourceFieldsError && (
        <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm text-[var(--warning)]">
          {sourceFieldsError}
        </div>
      )}

      {/* AmoCRM: static default mapping */}
      {destType === "amocrm" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Default AmoCRM Mapping</p>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            AmoCRM uchun qo'lda mapping talab qilinmaydi:
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-soft)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Manba</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">AmoCRM</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["full_name", "FULL_NAME (Ism familiya)"],
                  ["phone_number", "PHONE (Telefon)"],
                  ["email", "EMAIL (Email)"],
                ].map(([src, dest]) => (
                  <tr key={src} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-primary)]">{src}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">{dest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bitrix24 mapping */}
      {destType === "bitrix24" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <MappingTable
            rows={mappingRows}
            sourceOptions={sourceOptions}
            bitrixOptions={bitrixOptions}
            onAdd={onMappingRowAdd}
            onRemove={onMappingRowRemove}
            onUpdate={onMappingRowUpdate}
            onAutoMap={handleAutoMap}
          />
        </div>
      )}

      {/* Google Sheets — mapping is configured in Step 2 */}
      {destType === "google_sheets" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            Google Sheets mapping "Maqsad" bosqichida sozlanadi. Keyingi bosqichga o'ting.
          </p>
        </div>
      )}
    </div>
  );
}
