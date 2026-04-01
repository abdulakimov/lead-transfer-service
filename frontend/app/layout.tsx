import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeadFlow Frontend",
  description: "Operations dashboard for lead transfer workflows",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = 'narvon-theme-mode';
                  var raw = localStorage.getItem(key);
                  var mode = (raw === 'light' || raw === 'dark' || raw === 'system') ? raw : 'light';
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
                  document.documentElement.setAttribute('data-theme', resolved);
                  document.documentElement.setAttribute('data-theme-mode', mode);
                  document.documentElement.style.colorScheme = resolved;
                } catch (e) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
