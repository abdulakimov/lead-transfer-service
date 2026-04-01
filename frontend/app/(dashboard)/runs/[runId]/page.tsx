"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DataPlaceholder } from "@/components/data-placeholder";
import { JsonViewer } from "@/components/json-viewer";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import { StatusPill } from "@/components/status-pill";
import { getWorkflowRunDetail } from "@/lib/api";
import type { WorkflowRunDetail } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import { ArrowLeft, RotateCcw } from "lucide-react";

function RunDetailContent({ runId }: { runId: string }) {
  const { token, ready } = useAuthToken();
  const query = useApiQuery<WorkflowRunDetail>(
    ["run-detail-v2", runId, token],
    () => getWorkflowRunDetail(runId, token!),
    { enabled: ready && Boolean(token && runId), throwOnError: true, staleMs: 6_000 },
  );

  if (!ready || query.isLoading) {
    return <PageLoading />;
  }

  if (!query.data) {
    return <DataPlaceholder title="Run not found" description="This run may have been deleted or is inaccessible." tone="error" />;
  }

  const { run, steps } = query.data;

  return (
    <>
      <Link href="/runs" className="btn-ghost mb-3">
        <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Runs ro'yxatiga qaytish
      </Link>

      <section className="panel-soft p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">{run.workflow_name}</p>
            <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">Run {run.id}</p>
          </div>
          <StatusPill status={run.status} />
        </div>

        <div className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-2">
          <p>Workflow version: {run.workflow_version}</p>
          <p>Trigger event: {run.trigger_event_id ?? "-"}</p>
          <p>Source type: {run.source_type}</p>
          <p>Source ref: {run.source_ref ?? "-"}</p>
          <p>Attempts: {run.attempts}</p>
          <p>Updated: {new Date(run.updated_at).toLocaleString()}</p>
        </div>

        <details className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">Run Context</summary>
          <JsonViewer value={run.context ?? null} />
        </details>
      </section>

      <section className="mt-5 space-y-3">
        {steps.map((step) => (
          <article key={step.id} className="panel-soft p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{step.step_key}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  type={step.step_type} order={step.step_order} attempt={step.attempt}
                </p>
              </div>
              <StatusPill status={step.status} />
            </div>

            <div className="mt-3 grid gap-2 xl:grid-cols-3">
              <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Input</summary>
                <JsonViewer value={step.input_data} />
              </details>
              <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Output</summary>
                <JsonViewer value={step.output_data} />
              </details>
              <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Error</summary>
                <JsonViewer value={step.error_data} />
              </details>
            </div>
          </article>
        ))}
      </section>

      <button className="btn-ghost mt-5" onClick={() => void query.refetch()} type="button">
        <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {query.isRefreshing ? "Refreshing..." : "Refresh details"}
      </button>
    </>
  );
}

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  return (
    <QueryBoundary>
      <RunDetailContent runId={runId} />
    </QueryBoundary>
  );
}

