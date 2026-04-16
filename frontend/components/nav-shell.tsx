"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Cable,
  Database,
  LayoutGrid,
  Link2,
  ListOrdered,
  LogOut,
  SquareStack,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { clearSession, getAccessToken, getSessionUser } from "@/lib/session";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import brandLogoNoText from "@/asstes/brand/logo-no-text-cropped.png";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type PageMeta = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Bosh sahifa", icon: LayoutGrid },
  { href: "/leads", label: "Lidlar", icon: Database },
  { href: "/integrations", label: "Integratsiyalar", icon: Zap },
  { href: "/connections", label: "Ulanishlar", icon: Link2 },
];

function resolvePageMeta(pathname: string): PageMeta {
  if (pathname.startsWith("/runs/")) {
    return {
      eyebrow: "Run tafsiloti",
      title: "Payload va Step Timeline",
      subtitle: "Trigger/action payloadlari va xatolarni shu yerdan tekshiring.",
      icon: SquareStack,
    };
  }
  if (pathname.startsWith("/runs")) {
    return {
      eyebrow: "Runs",
      title: "Workflow execution runs",
      subtitle: "Har bir ishga tushirish holatini va vaqt bo'yicha oqimini kuzating.",
      icon: ListOrdered,
    };
  }
  if (pathname.startsWith("/leads")) {
    return {
      eyebrow: "Lidlar",
      title: "Lidlar jurnali",
      subtitle: "Har bir lidning qabul qilinishidan CRMgacha bo'lgan holatini kuzating.",
      icon: Database,
    };
  }
  if (pathname.startsWith("/integrations")) {
    return {
      eyebrow: "Integratsiyalar",
      title: "Integratsiyalar",
      subtitle: "Meta leadlarini Bitrix24 yoki AmoCRM ga ishonchli yuborish uchun bridge larni boshqaring.",
      icon: Zap,
    };
  }
  if (pathname.startsWith("/connections")) {
    return {
      eyebrow: "Ulanishlar",
      title: "Ulanishlar",
      subtitle: "Akkountlarni bir marta ulang va keyingi integratsiyalarda qayta foydalaning.",
      icon: Cable,
    };
  }
  if (pathname.startsWith("/workflows")) {
    return {
      eyebrow: "Workflows",
      title: "Workflow authoring va dispatch",
      subtitle: "Versiyalangan workflow yarating, publish qiling va test run'larni yuboring.",
      icon: Wrench,
    };
  }
  if (pathname.startsWith("/analytics")) {
    return {
      eyebrow: "Analytics",
      title: "Performance analytics",
      subtitle: "Yetkazish sifati va source natijalarini solishtirib optimallashtiring.",
      icon: BarChart3,
    };
  }
  return {
    eyebrow: "Dashboard",
    title: "Bosh sahifa",
    subtitle: "Lead oqimi va yetkazish samaradorligini umumiy ko'rinishda kuzating.",
    icon: LayoutGrid,
  };
}

function decodeJwtPayload(token: string): { email?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { email?: string };
    return payload;
  } catch {
    return null;
  }
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountEmail, setAccountEmail] = useState("operator@leadflow.uz");
  const [accountNameRaw, setAccountNameRaw] = useState<string | null>(null);
  const [accountAvatar, setAccountAvatar] = useState<string | null>(null);

  useEffect(() => {
    const user = getSessionUser();
    if (user?.email) {
      setAccountEmail(user.email);
    }
    if (user?.name) {
      setAccountNameRaw(user.name);
    }
    if (user?.avatar_url) {
      setAccountAvatar(user.avatar_url);
    }

    const token = getAccessToken();
    if (!token) return;
    const payload = decodeJwtPayload(token);
    if (payload?.email && !user?.email) {
      setAccountEmail(payload.email);
    }
  }, []);

  const accountName = useMemo(() => {
    if (accountNameRaw?.trim()) {
      return accountNameRaw.trim();
    }
    const local = accountEmail.split("@")[0] ?? "Foydalanuvchi";
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length > 1) {
      return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    }
    return local.charAt(0).toUpperCase() + local.slice(1);
  }, [accountEmail, accountNameRaw]);

  const initials = useMemo(() => {
    const segments = accountName.split(" ").filter(Boolean);
    if (segments.length === 0) return "U";
    return segments.slice(0, 2).map((item) => item.charAt(0).toUpperCase()).join("");
  }, [accountName]);
  const pageMeta = useMemo(() => resolvePageMeta(pathname), [pathname]);
  const HeaderIcon = pageMeta.icon;

  function logout() {
    clearSession();
    router.push("/login");
  }

  return (
    <div className="min-h-screen w-full">
      <div className="w-full border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="grid min-h-screen w-full lg:grid-cols-[290px_1fr]">
          <aside className="sticky top-0 flex h-screen flex-col border-r border-[var(--border)] bg-[var(--shell)] p-4 sm:p-5">
            <div className="flex items-center gap-3 px-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand)]/10">
                <Image
                  src={brandLogoNoText}
                  alt="Narvon belgisi"
                  priority
                  className="h-8 w-8 object-contain"
                />
              </span>
              <p className="text-[30px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">Narvon</p>
            </div>

            <nav className="mt-6">
              <div className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${active
                        ? "bg-[var(--surface)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="mt-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center gap-3">
                {accountAvatar ? (
                  <img
                    alt={accountName}
                    className="h-10 w-10 rounded-full border border-[var(--divider)] object-cover"
                    src={accountAvatar}
                  />
                ) : (
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--divider)] bg-[var(--surface-soft)] text-sm font-semibold text-[var(--brand-soft)]">
                    {initials}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{accountName}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]" title={accountEmail}>{accountEmail}</p>
                </div>
              </div>
              <button className="btn-ghost mt-3 w-full" onClick={logout} type="button">
                <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                Chiqish
              </button>
            </div>
          </aside>

          <main className="bg-[var(--surface)]">
            <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <h1 className="inline-flex items-center gap-2 text-[30px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-soft)] text-[var(--brand)]">
                    <HeaderIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  {pageMeta.title}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <ThemeSwitcher />
                <LanguageSwitcher />
              </div>
            </header>

            <div className="p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

