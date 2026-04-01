"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-3xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-5">
      <p className="section-kicker text-[var(--danger)]">Dashboard Error</p>
      <h2 className="mt-2 text-2xl font-semibold text-[var(--danger)]">Module failed to render</h2>
      <p className="mt-2 text-sm text-[var(--danger)]">{error.message}</p>
      <button className="btn-primary mt-4" onClick={() => reset()} type="button">
        Retry
      </button>
    </div>
  );
}
