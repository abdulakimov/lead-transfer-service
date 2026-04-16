"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

export function UiDropdown({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
  loading,
}: {
  label?: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        o.sublabel?.toLowerCase().includes(q),
    );
  }, [options, search]);

  return (
    <div className="relative">
      {label ? <label className="label">{label}</label> : null}
      <button
        className="field flex w-full items-center justify-between text-left"
        disabled={disabled || loading}
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        type="button"
      >
        <span className={`truncate ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
          {loading ? "Yuklanmoqda..." : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown
          className={`ml-2 h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="scrollbar-ui absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          {options.length > 5 && (
            <div className="sticky top-0 border-b border-[var(--border)] bg-[var(--surface)] p-2">
              <div className="relative flex items-center">
                <Search className="absolute left-3 h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Qidirish..."
                  className="field !pl-9 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => {}}
                  autoFocus
                />
                {search && (
                  <button
                    className="absolute right-3 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={() => setSearch("")}
                    type="button"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
          <button
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
            onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
            type="button"
          >
            {placeholder}
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
              Natija topilmadi
            </div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-soft)] ${
                  value === option.value
                    ? "bg-[var(--surface-soft)] font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-primary)]"
                }`}
                onClick={() => { onChange(option.value); setOpen(false); setSearch(""); }}
                type="button"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">{option.label}</span>
                  {option.sublabel ? (
                    <span className="text-xs text-[var(--text-secondary)]">{option.sublabel}</span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
