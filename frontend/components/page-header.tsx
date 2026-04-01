interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, action, icon }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="section-kicker inline-flex items-center gap-2">
          {icon ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-soft)] text-[var(--brand)]">{icon}</span> : null}
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[40px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">{title}</h1>
        {subtitle ? <p className="section-copy mt-2 max-w-3xl">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
