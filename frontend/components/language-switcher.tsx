"use client";

import { useEffect, useState } from "react";
import { Check, Languages } from "lucide-react";
import { applyLanguage, getStoredLanguage, type LanguageMode } from "@/lib/language";

const OPTIONS: Array<{ mode: LanguageMode; label: string }> = [
  { mode: "uz", label: "O'zbek" },
  { mode: "en", label: "English" },
  { mode: "ru", label: "Russian" },
];

export function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LanguageMode>("uz");

  useEffect(() => {
    const initial = getStoredLanguage();
    setMode(initial);
    applyLanguage(initial);
  }, []);

  return (
    <div className="relative">
      <button
        aria-label="Til"
        className="btn-ghost h-11 w-11 rounded-xl px-0"
        onClick={() => setOpen((prev) => !prev)}
        title="Til"
        type="button"
      >
        <Languages className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            aria-label="Menyu yopish"
            className="fixed inset-0 z-10 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl">
            {OPTIONS.map((item) => {
              const selected = item.mode === mode;
              return (
                <button
                  key={item.mode}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    selected
                      ? "bg-[var(--surface-soft)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
                  }`}
                  onClick={() => {
                    setMode(item.mode);
                    applyLanguage(item.mode);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="flex-1">{item.label}</span>
                  {selected ? <Check className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
