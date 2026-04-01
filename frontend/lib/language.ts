export type LanguageMode = "uz" | "en" | "ru";

export const LANGUAGE_STORAGE_KEY = "leadflow-language";

export function getStoredLanguage(): LanguageMode {
  if (typeof window === "undefined") return "uz";
  const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (raw === "en" || raw === "ru" || raw === "uz") return raw;
  return "uz";
}

export function applyLanguage(mode: LanguageMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, mode);
  document.documentElement.setAttribute("lang", mode);
}

