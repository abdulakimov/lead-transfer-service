import { NavShell } from "@/components/nav-shell";
import { AuthGuard } from "@/components/auth-guard";
import { MetaPixelBootstrap } from "@/components/meta-pixel-bootstrap";
import { TRACKING_ENABLED } from "@/lib/feature-flags";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {TRACKING_ENABLED ? <MetaPixelBootstrap /> : null}
      <NavShell>{children}</NavShell>
    </AuthGuard>
  );
}
