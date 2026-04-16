"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  createWorkflow,
  createWorkflowVersion,
  dispatchWorkflow,
  getWorkflows,
  publishWorkflow,
  type CreateWorkflowInput,
} from "@/lib/api";
import { invalidateQueryCache } from "@/lib/query-cache";
import type { Workflow } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import { DataPlaceholder } from "@/components/data-placeholder";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import { StatusPill } from "@/components/status-pill";
import { GitCommitHorizontal, Play, Plus, Rocket, RotateCcw } from "lucide-react";

function parseJsonObject(raw: string, field: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("must be JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "invalid json";
    throw new Error(`${field}: ${reason}`);
  }
}

function WorkflowsContent() {
  const { token, ready } = useAuthToken();
  const query = useApiQuery<Workflow[]>(
    ["workflows-v2", token],
    () => getWorkflows(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 10_000 },
  );

  const [selectedId, setSelectedId] = useState<string>("");
  const [createInput, setCreateInput] = useState<CreateWorkflowInput>({
    name: "",
    description: "",
    source_type: "lead_bridge",
    trigger_type: "lead.received",
    source_config: {},
  });
  const [definitionText, setDefinitionText] = useState('{"actions":[{"type":"bitrix24.create_lead"}]}');
  const [publishVersionId, setPublishVersionId] = useState("");
  const [publishVersionNumber, setPublishVersionNumber] = useState("");
  const [dispatchLeadgenId, setDispatchLeadgenId] = useState("");
  const [dispatchSourceRef, setDispatchSourceRef] = useState("");
  const [dispatchContext, setDispatchContext] = useState('{"origin":"ui.dispatch"}');
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const workflows = query.data ?? [];
  const selected = useMemo(() => workflows.find((item) => item.id === selectedId) ?? workflows[0] ?? null, [workflows, selectedId]);

  async function refresh() {
    invalidateQueryCache("workflows");
    invalidateQueryCache("runs");
    await query.refetch();
  }

  async function withAction(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown action error");
    } finally {
      setBusy(false);
    }
  }

  function onCreateWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    void withAction(async () => {
      const created = await createWorkflow(
        {
          name: createInput.name.trim(),
          description: createInput.description?.trim() || undefined,
          source_type: createInput.source_type,
          trigger_type: createInput.trigger_type,
          source_config: createInput.source_config,
        },
        token,
      );
      setSelectedId(created.id);
      setCreateInput((prev) => ({ ...prev, name: "", description: "" }));
      setMessage(`Workflow created: ${created.name}`);
      await refresh();
    });
  }

  function onCreateVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;

    void withAction(async () => {
      const definition = parseJsonObject(definitionText, "definition");
      const version = await createWorkflowVersion(selected.id, { definition }, token);
      setMessage(`Version created: v${version.version}`);
    });
  }

  function onPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;

    void withAction(async () => {
      const numeric = publishVersionNumber.trim() ? Number(publishVersionNumber.trim()) : undefined;
      const payload = {
        version_id: publishVersionId.trim() || undefined,
        version: Number.isFinite(numeric) ? numeric : undefined,
      };
      if (!payload.version_id && !payload.version) {
        throw new Error("Provide version_id or version number");
      }

      const published = await publishWorkflow(selected.id, payload, token);
      setMessage(`Published version v${published.version}`);
    });
  }

  function onDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;

    void withAction(async () => {
      const context = parseJsonObject(dispatchContext, "dispatch context");
      const result = await dispatchWorkflow(
        selected.id,
        {
          trigger_event_id: dispatchLeadgenId.trim(),
          source_ref: dispatchSourceRef.trim(),
          context,
        },
        token,
      );
      setMessage(`Dispatch done. Run ID: ${result.run.id}`);
    });
  }

  if (!ready || query.isLoading) {
    return <PageLoading />;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="panel-soft p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="section-kicker">Workflow Registry</p>
          <button className="btn-ghost" onClick={() => void refresh()} type="button">
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {query.isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {workflows.length === 0 ? (
          <DataPlaceholder title="No workflows" description="Create a workflow from the right panel." />
        ) : (
          <div className="space-y-2">
            {workflows.map((workflow) => {
              const active = (selected?.id ?? "") === workflow.id;
              return (
                <button
                  key={workflow.id}
                  className={`w-full rounded-2xl border p-4 text-left ${active ? "border-[var(--success-border)] bg-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface-soft)]"}`}
                  onClick={() => setSelectedId(workflow.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{workflow.name}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{workflow.source_type}{" -> "}{workflow.trigger_type}</p>
                    </div>
                    <StatusPill status={workflow.active ? "active" : "disabled"} />
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-[var(--text-secondary)]">{workflow.id}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <form className="panel-soft p-4" onSubmit={onCreateWorkflow}>
          <p className="mb-2 section-kicker">Create Workflow</p>
          <label className="label">Name</label>
          <input className="field" value={createInput.name} onChange={(e) => setCreateInput((p) => ({ ...p, name: e.target.value }))} required />
          <label className="label mt-2">Description</label>
          <input className="field" value={createInput.description} onChange={(e) => setCreateInput((p) => ({ ...p, description: e.target.value }))} />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input className="field" value={createInput.source_type} onChange={(e) => setCreateInput((p) => ({ ...p, source_type: e.target.value }))} />
            <input className="field" value={createInput.trigger_type} onChange={(e) => setCreateInput((p) => ({ ...p, trigger_type: e.target.value }))} />
          </div>
          <button className="btn-primary mt-3" disabled={busy} type="submit">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Create
          </button>
        </form>

        <form className="panel-soft p-4" onSubmit={onCreateVersion}>
          <p className="mb-2 section-kicker">Create Version</p>
          <textarea className="field min-h-28 font-mono text-xs" value={definitionText} onChange={(e) => setDefinitionText(e.target.value)} />
          <button className="btn-primary mt-3" disabled={busy || !selected} type="submit">
            <GitCommitHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Create version
          </button>
        </form>

        <form className="panel-soft p-4" onSubmit={onPublish}>
          <p className="mb-2 section-kicker">Publish Version</p>
          <input className="field" placeholder="version_id" value={publishVersionId} onChange={(e) => setPublishVersionId(e.target.value)} />
          <input className="field mt-2" placeholder="or version number" value={publishVersionNumber} onChange={(e) => setPublishVersionNumber(e.target.value)} />
          <button className="btn-primary mt-3" disabled={busy || !selected} type="submit">
            <Rocket className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Publish
          </button>
        </form>

        <form className="panel-soft p-4" onSubmit={onDispatch}>
          <p className="mb-2 section-kicker">Dispatch Test</p>
          <input className="field" placeholder="leadgen id" value={dispatchLeadgenId} onChange={(e) => setDispatchLeadgenId(e.target.value)} required />
          <input className="field mt-2" placeholder="source page id" value={dispatchSourceRef} onChange={(e) => setDispatchSourceRef(e.target.value)} required />
          <textarea className="field mt-2 min-h-20 font-mono text-xs" value={dispatchContext} onChange={(e) => setDispatchContext(e.target.value)} />
          <button className="btn-primary mt-3" disabled={busy || !selected} type="submit">
            <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Dispatch
          </button>
        </form>

        {message ? <DataPlaceholder title="Action completed" description={message} /> : null}
        {actionError ? <DataPlaceholder title="Action failed" description={actionError} tone="error" /> : null}
      </section>
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <QueryBoundary>
      <WorkflowsContent />
    </QueryBoundary>
  );
}

