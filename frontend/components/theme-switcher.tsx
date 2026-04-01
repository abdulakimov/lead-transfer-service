"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, MoonStar, Sun } from "lucide-react";
import { applyTheme, getStoredThemeMode, resolveTheme, type ThemeMode, type ResolvedTheme } from "@/lib/theme";

const OPTIONS: Array<{ mode: ThemeMode; label: string; icon: typeof Monitor }> = [
  { mode: "system", label: "Tizim", icon: Monitor },
  { mode: "light", label: "Yorug'", icon: Sun },
  { mode: "dark", label: "Qorong'u", icon: MoonStar },
];

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("light");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const initial = getStoredThemeMode();
    setMode(initial);
    applyTheme(initial);
    setResolvedTheme(resolveTheme(initial));
  }, []);

  useEffect(() => {
    setResolvedTheme(resolveTheme(mode));
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setResolvedTheme(resolveTheme("system"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  const TriggerIcon = resolvedTheme === "dark" ? MoonStar : Sun;

  return (
    <div className="relative">
      <button
        aria-label="Mavzu"
        className="btn-ghost h-11 w-11 rounded-xl px-0"
        onClick={() => setOpen((prev) => !prev)}
        title={`Mavzu: ${resolvedTheme === "dark" ? "Qorong'u" : "Yorug'"}`}
        type="button"
      >
        <TriggerIcon className="h-5 w-5" aria-hidden="true" />
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
              const Icon = item.icon;
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
                    applyTheme(item.mode);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
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
