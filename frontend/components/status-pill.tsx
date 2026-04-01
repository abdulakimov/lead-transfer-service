export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const labelMap: Record<string, string> = {
    active: "faol",
    delivered: "yetkazildi",
    completed: "bajarildi",
    failed: "xato",
    error: "xato",
    dlq: "qayta ko'rish",
    running: "jarayonda",
    processing: "ishlanmoqda",
    pending: "kutilmoqda",
    disabled: "o'chirilgan",
  };
  const tone =
    normalized === "delivered" || normalized === "completed" || normalized === "active"
      ? "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]"
      : normalized === "failed" || normalized === "dlq" || normalized === "error"
        ? "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
        : normalized === "running" || normalized === "processing"
          ? "border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]"
          : "border-[var(--status-border)] bg-[var(--status-soft)] text-[var(--status-text)]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {labelMap[normalized] ?? status}
    </span>
  );
}

