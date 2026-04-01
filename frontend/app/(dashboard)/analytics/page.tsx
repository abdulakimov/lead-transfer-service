export default function AnalyticsPage() {
  return (
    <div>
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="panel-soft p-5">
          <p className="section-kicker">Delivery Health</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Success ratio, retry pressure, and DLQ trend.</p>
        </article>
        <article className="panel-soft p-5">
          <p className="section-kicker">Source Quality</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Page/form level variance and missing-field diagnostics.</p>
        </article>
        <article className="panel-soft p-5">
          <p className="section-kicker">Pixel / CAPI</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Dedup key parity, event mismatch, and timestamp drift checks.</p>
        </article>
      </section>
    </div>
  );
}
