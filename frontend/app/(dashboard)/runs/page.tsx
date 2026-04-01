"use client";

import Link from "next/link";
import { DataPlaceholder } from "@/components/data-placeholder";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import { StatusPill } from "@/components/status-pill";
import { getWorkflowRuns } from "@/lib/api";
import type { WorkflowRun } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import { RotateCcw } from "lucide-react";

function RunsContent() {
  const { token, ready } = useAuthToken();
  const query = useApiQuery<WorkflowRun[]>(
    ["runs-v2", token],
    async () => (await getWorkflowRuns(token!)).runs,
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 8_000 },
  );

  if (!ready || query.isLoading) {
    return <PageLoading />;
  }

  const runs = query.data ?? [];
  if (runs.length === 0) {
    return <DataPlaceholder title="No runs found" description="Dispatch a workflow test to create execution entries." />;
  }

  return (
    <section className="panel-soft p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="section-kicker">Execution Timeline</p>
        <button className="btn-ghost" onClick={() => void query.refetch()} type="button">
          <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {query.isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="space-y-2">
        {runs.map((run) => (
          <Link key={run.id} href={`/runs/${run.id}`} className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--success-border)] hover:bg-[var(--success-soft)]/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{run.workflow_name}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Version {run.workflow_version}</p>
                <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">{run.id}</p>
              </div>
              <div className="text-right">
                <StatusPill status={run.status} />
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{new Date(run.updated_at).toLocaleString()}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function RunsPage() {
  return (
    <QueryBoundary>
      <RunsContent />
    </QueryBoundary>
  );
}

