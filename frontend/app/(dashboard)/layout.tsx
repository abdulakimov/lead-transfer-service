import { NavShell } from "@/components/nav-shell";
import { AuthGuard } from "@/components/auth-guard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <NavShell>{children}</NavShell>
    </AuthGuard>
  );
}
