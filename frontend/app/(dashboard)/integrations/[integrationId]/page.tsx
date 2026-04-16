"use client";

import { use, useEffect, useState } from "react";
import { getIntegrationById } from "@/lib/api";
import { useAuthToken } from "@/lib/use-auth-token";
import { PageLoading } from "@/components/page-loading";
import type { Integration } from "@/lib/types";
import { IntegrationEditor } from "./_components/integration-editor";

export default function IntegrationEditorPage({
  params,
}: {
  params: Promise<{ integrationId: string }>;
}) {
  const { integrationId } = use(params);
  const { token, ready } = useAuthToken();
  const isNew = integrationId === "new";

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !ready || !token) return;
    setLoading(true);
    void getIntegrationById(integrationId, token)
      .then(setIntegration)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Integratsiya topilmadi");
      })
      .finally(() => setLoading(false));
  }, [integrationId, isNew, ready, token]);

  if (!ready || loading) return <PageLoading />;

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-6 py-4 text-[var(--danger)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <IntegrationEditor
      integrationId={integrationId}
      initialIntegration={integration}
    />
  );
}
