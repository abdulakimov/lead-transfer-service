import { AlertCircle, Info } from "lucide-react";

interface DataPlaceholderProps {
  title: string;
  description?: string;
  tone?: "neutral" | "error";
  action?: React.ReactNode;
}

export function DataPlaceholder({ title, description, tone = "neutral", action }: DataPlaceholderProps) {
  const toneClass = tone === "error"
    ? "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]";
  const iconToneClass = tone === "error"
    ? "bg-[var(--danger-soft)] text-[var(--danger)]"
    : "bg-[var(--info-soft)] text-[var(--info)]";
  const Icon = tone === "error" ? AlertCircle : Info;

  return (
    <div className={`rounded-3xl border p-5 ${toneClass}`}>
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${iconToneClass}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {description ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

