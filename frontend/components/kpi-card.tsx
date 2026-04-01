interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "danger";
}

export function KpiCard({ label, value, hint, tone = "neutral" }: KpiCardProps) {
  const toneClass =
    tone === "good"
      ? "bg-[var(--info-soft)]"
      : tone === "danger"
        ? "bg-[var(--danger-soft)]"
        : "bg-[var(--surface)]";

  return (
    <article className={`rounded-2xl border border-[var(--border)] p-5 ${toneClass}`}>
      <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
      <p className="mt-2 text-[44px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">{value}</p>
      {hint ? <p className="mt-2 inline-flex rounded-md bg-[var(--surface-soft)] px-2 py-1 text-xs text-[var(--text-secondary)]">{hint}</p> : null}
    </article>
  );
}
