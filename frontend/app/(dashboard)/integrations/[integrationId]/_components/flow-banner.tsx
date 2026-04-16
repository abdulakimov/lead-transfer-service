"use client";

const SOURCE_CONFIG = {
  facebook: { label: "Meta Ads", color: "bg-blue-50 border-blue-200 text-blue-700" },
  google_forms: { label: "Google Forms", color: "bg-purple-50 border-purple-200 text-purple-700" },
} as const;

const DEST_CONFIG = {
  bitrix24: { label: "Bitrix24", color: "bg-sky-50 border-sky-200 text-sky-700" },
  amocrm: { label: "AmoCRM", color: "bg-orange-50 border-orange-200 text-orange-700" },
  google_sheets: { label: "Google Sheets", color: "bg-green-50 border-green-200 text-green-700" },
} as const;

export function FlowBanner({
  sourceType,
  sourceName,
  destType,
  mappingCount,
}: {
  sourceType: string | null;
  sourceName: string | null;
  destType: string | null;
  destName: string | null;
  mappingCount: number;
}) {
  const sourceConf = sourceType
    ? SOURCE_CONFIG[sourceType as keyof typeof SOURCE_CONFIG]
    : null;
  const destConf = destType
    ? DEST_CONFIG[destType as keyof typeof DEST_CONFIG]
    : null;

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 lg:px-6">
      <div
        className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
          sourceConf?.color ?? "border-dashed border-[var(--border)] text-[var(--text-secondary)]"
        }`}
      >
        <span className="truncate">
          {sourceName ?? sourceConf?.label ?? "Manba tanlanmagan"}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <div className="h-px w-8 bg-[var(--border)]" />
        {mappingCount > 0 && (
          <span className="rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-bold text-white">
            {mappingCount}
          </span>
        )}
      </div>

      <div
        className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
          destConf?.color ?? "border-dashed border-[var(--border)] text-[var(--text-secondary)]"
        }`}
      >
        <span className="truncate">
          {destConf?.label ?? "Maqsad tanlanmagan"}
        </span>
      </div>
    </div>
  );
}
