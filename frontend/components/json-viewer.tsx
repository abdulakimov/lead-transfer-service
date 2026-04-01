export function JsonViewer({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 max-h-72 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--shell)] p-3 text-xs leading-relaxed text-[var(--text-primary)]">
      {value === null || value === undefined ? "null" : JSON.stringify(value, null, 2)}
    </pre>
  );
}
