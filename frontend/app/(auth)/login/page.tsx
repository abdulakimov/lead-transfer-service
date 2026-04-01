"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthGoogleInit, login, register } from "@/lib/api";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { setSession } from "@/lib/session";
import { Chrome, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingEmail(true);
    setError(null);

    try {
      const result = mode === "login"
        ? await login(email, password)
        : await register({ name: name.trim(), email, password });
      setSession(result.access_token, result.refresh_token, result.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Autentifikatsiya xatosi");
    } finally {
      setLoadingEmail(false);
    }
  }

  async function onGoogleAuth() {
    setError(null);
    setLoadingGoogle(true);

    try {
      const init = await getAuthGoogleInit(window.location.origin);
      const popup = window.open(
        init.auth_url,
        "leadflow-auth-google",
        "width=540,height=720,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes",
      );
      if (!popup) {
        throw new Error("Popup ochilmadi. Brauzer popup bloklamaganini tekshiring.");
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error("Google autentifikatsiya vaqti tugadi."));
        }, 120_000);

        const onMessage = (event: MessageEvent) => {
          const data = event.data as {
            source?: string;
            success?: boolean;
            error?: string;
            payload?: {
              access_token: string;
              refresh_token: string;
              user?: { id?: string; email?: string; name?: string; avatar_url?: string };
            };
          };

          if (data?.source !== "leadflow-auth-google") return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMessage);

          if (!data.success || !data.payload?.access_token || !data.payload?.refresh_token) {
            reject(new Error(data.error || "Google autentifikatsiya xatosi"));
            return;
          }

          setSession(data.payload.access_token, data.payload.refresh_token, data.payload.user);
          resolve();
        };

        window.addEventListener("message", onMessage);
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google autentifikatsiya xatosi");
    } finally {
      setLoadingGoogle(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] px-4 py-6 sm:px-8"
      style={{
        backgroundImage: "linear-gradient(to right, color-mix(in oklab, var(--border) 70%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 70%, transparent) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }}
    >
      <div className="flex justify-end gap-2">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>

      <div className="mx-auto flex min-h-[88vh] max-w-5xl items-center justify-center p-4">
        <section className="w-full max-w-[460px] rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_45px_rgba(18,26,52,0.08)] sm:p-7">
          <div className="grid w-full grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-1 text-sm">
            <button
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 ${mode === "login" ? "bg-[var(--surface)] font-semibold text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"}`}
              onClick={() => setMode("login")}
              type="button"
            >
              <LogIn className="h-4 w-4" />
              Kirish
            </button>
            <button
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 ${mode === "signup" ? "bg-[var(--surface)] font-semibold text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"}`}
              onClick={() => setMode("signup")}
              type="button"
            >
              <UserPlus className="h-4 w-4" />
              Ro'yxatdan o'tish
            </button>
          </div>

          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:opacity-60"
            disabled={loadingGoogle}
            onClick={() => void onGoogleAuth()}
            type="button"
          >
            <Chrome className="h-4 w-4" />
            {loadingGoogle ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Google orqali ulanmoqda...
              </span>
            ) : "Google orqali kirish"}
          </button>

          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            or
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <form className="space-y-3" onSubmit={onSubmit}>
            {mode === "signup" ? (
              <div>
                <label className="label" htmlFor="name">Ism</label>
                <input
                  id="name"
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  autoComplete="name"
                  required
                />
              </div>
            ) : null}

            <div>
              <label className="label" htmlFor="email">Email manzil</label>
              <input
                id="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="password">Parol</label>
              <div className="relative">
                <input
                  id="password"
                  className="field pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
                <button
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
                  onClick={() => setShowPassword((prev) => !prev)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <button
              className="mt-1 w-full rounded-xl border border-[#6e62f2] bg-gradient-to-b from-[#7f74ff] to-[#5a4ce8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(90,76,232,0.26)] transition hover:from-[#9187ff] hover:to-[#6a5cf0] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loadingEmail}
              type="submit"
            >
              {loadingEmail ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-[var(--border)] border-t-[var(--surface)]" />
                  {mode === "login" ? "Kirilmoqda..." : "Yaratilmoqda..."}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {mode === "login" ? <LogIn className="h-4 w-4" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                  {mode === "login" ? "Kirish" : "Hisob yaratish"}
                </span>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
            {mode === "login" ? "Hisobingiz yo'qmi? " : "Hisobingiz bormi? "}
            <button
              className="font-semibold text-[var(--text-primary)] underline underline-offset-2"
              onClick={() => setMode((prev) => (prev === "login" ? "signup" : "login"))}
              type="button"
            >
              {mode === "login" ? "Ro'yxatdan o'tish" : "Kirish"}
            </button>
          </p>
        </section>
      </div>
    </div>
  );
}
