"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createIntegration,
  createGoogleSpreadsheet,
  getBitrixLeadFields,
  getBitrixLeadFieldsByIntegration,
  getBitrixFunnels,
  getBitrixFunnelsByIntegration,
  getConnections,
  getFacebookFormFields,
  getGoogleFormFields,
  getGoogleForms,
  getGoogleSpreadsheetMeta,
  syncGoogleSpreadsheetColumns,
  updateIntegration,
  type BitrixLeadField,
  type ConnectionSummary,
  type CreateIntegrationInput,
  type FacebookSourceField,
  type GoogleFormOption,
} from "@/lib/api";
import type { Integration } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { useAuthToken } from "@/lib/use-auth-token";
import { PageLoading } from "@/components/page-loading";

import { EditorTopbar, type SaveStatus } from "./editor-topbar";
import { FlowBanner } from "./flow-banner";
import { StepRail, type EditorStep, type StepSublabels } from "./step-rail";
import { StepSource } from "./step-source";
import { StepDestination } from "./step-destination";
import { StepMapping } from "./step-mapping";
import { StepSettings } from "./step-settings";
import { newMappingRow, type MappingRow } from "./mapping-table";

// ─── State shape ─────────────────────────────────────────────────────────────

interface EditorState {
  name: string;
  active: boolean;
  sourceType: "facebook" | "google_forms";
  sourceConnectionId: string;
  sourcePageId: string;
  sourceFormId: string;
  destType: "bitrix24" | "amocrm" | "google_sheets";
  destConnectionId: string;
  destCredentials: string;
  destResourceId: string;
  destSheetName: string;
  destFunnelId: string;
  googleSpreadsheetMode: "existing" | "create";
  googleCreateSpreadsheetName: string;
  googleCreateSheetName: string;
  googleHeaderMode: "default" | "custom" | "none";
  googleCreatedSpreadsheetUrl: string;
  dedupEnabled: boolean;
  dedupField: "phone" | "email";
  notifyTelegramChatId: string;
}

const INITIAL_STATE: EditorState = {
  name: "",
  active: true,
  sourceType: "facebook",
  sourceConnectionId: "",
  sourcePageId: "",
  sourceFormId: "",
  destType: "bitrix24",
  destConnectionId: "",
  destCredentials: "",
  destResourceId: "",
  destSheetName: "Sheet1",
  destFunnelId: "",
  googleSpreadsheetMode: "existing",
  googleCreateSpreadsheetName: "",
  googleCreateSheetName: "Leads",
  googleHeaderMode: "default",
  googleCreatedSpreadsheetUrl: "",
  dedupEnabled: true,
  dedupField: "phone",
  notifyTelegramChatId: "",
};

function stateFromIntegration(row: Integration): EditorState {
  const sourceType: EditorState["sourceType"] =
    row.source_type === "google_forms" ? "google_forms" : "facebook";
  const destType: EditorState["destType"] =
    row.dest_type === "google_sheets"
      ? "google_sheets"
      : row.dest_type === "amocrm"
        ? "amocrm"
        : "bitrix24";

  return {
    name: row.name ?? "",
    active: row.active,
    sourceType,
    sourceConnectionId: row.source_connection_id ?? "",
    sourcePageId: row.source_page_id ?? "",
    sourceFormId: row.source_form_id ?? "",
    destType,
    destConnectionId: row.dest_connection_id ?? "",
    destCredentials: row.dest_credentials_preview ?? "",
    destResourceId: row.dest_resource_id ?? "",
    destSheetName: row.dest_sheet_name ?? "Sheet1",
    destFunnelId: row.dest_funnel_id ?? "",
    googleSpreadsheetMode: "existing",
    googleCreateSpreadsheetName: "",
    googleCreateSheetName: row.dest_sheet_name ?? "Leads",
    googleHeaderMode: "default",
    googleCreatedSpreadsheetUrl: "",
    dedupEnabled: row.dedup_enabled,
    dedupField: row.dedup_field ?? "phone",
    notifyTelegramChatId: row.notify_telegram_chat_id ?? "",
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntegrationEditor({
  integrationId,
  initialIntegration,
}: {
  integrationId: string;
  initialIntegration: Integration | null;
}) {
  const router = useRouter();
  const { token, ready } = useAuthToken();
  const isNew = integrationId === "new";
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectionsQuery = useApiQuery<ConnectionSummary[]>(
    ["connections-editor-v1", token],
    () => getConnections(token!),
    { enabled: ready && Boolean(token), staleMs: 30_000 },
  );
  const connections = connectionsQuery.data ?? [];

  // ── Form state ──────────────────────────────────────────────────────────────
  const [state, setState] = useState<EditorState>(
    initialIntegration ? stateFromIntegration(initialIntegration) : INITIAL_STATE,
  );

  const [mappingRows, setMappingRows] = useState<MappingRow[]>(() => {
    if (!initialIntegration) return [];
    const entries = Object.entries(initialIntegration.field_mapping ?? {});
    return entries.map(([sourceField, destinationField]) => ({
      id: crypto.randomUUID?.() ?? `r_${Math.random()}`,
      sourceField,
      destinationField,
    }));
  });

  // ── Async data ──────────────────────────────────────────────────────────────
  const [bitrixFields, setBitrixFields] = useState<BitrixLeadField[]>([]);
  const [bitrixFieldsLoading, setBitrixFieldsLoading] = useState(false);
  const [bitrixFieldsLoaded, setBitrixFieldsLoaded] = useState(false);
  const [bitrixFunnels, setBitrixFunnels] = useState<Array<{ id: string; name: string }>>([]);
  const [bitrixFunnelsLoading, setBitrixFunnelsLoading] = useState(false);
  const [sourceFields, setSourceFields] = useState<FacebookSourceField[]>([]);
  const [sourceFieldsLoading, setSourceFieldsLoading] = useState(false);
  const [sourceFieldsError, setSourceFieldsError] = useState<string | null>(null);
  const [googleForms, setGoogleForms] = useState<GoogleFormOption[]>([]);
  const [googleFormsLoading, setGoogleFormsLoading] = useState(false);
  const [googleSpreadsheetTabs, setGoogleSpreadsheetTabs] = useState<string[]>([]);
  const [googleSheetHeaders, setGoogleSheetHeaders] = useState<string[]>([]);
  const [googleSheetMetaLoading, setGoogleSheetMetaLoading] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<EditorStep>(1);
  const [visitedSteps, setVisitedSteps] = useState<Set<EditorStep>>(
    () => new Set(isNew ? [1] : ([1, 2, 3, 4] as EditorStep[])),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Action handlers ─────────────────────────────────────────────────────────

  function patch(updates: Partial<EditorState>) {
    setState((prev) => ({ ...prev, ...updates }));
  }

  const loadBitrixFields = useCallback(async () => {
    if (!token) return;
    const hasNewUrl = state.destCredentials.trim().length > 0;
    const hasSavedCreds = !isNew && initialIntegration?.dest_credentials_set;
    if (!hasNewUrl && !hasSavedCreds) return;
    setBitrixFieldsLoading(true);
    try {
      const result = hasNewUrl
        ? await getBitrixLeadFields(state.destCredentials.trim(), token)
        : await getBitrixLeadFieldsByIntegration(integrationId, token);
      setBitrixFields(result.fields);
      setBitrixFieldsLoaded(true);
    } catch {
      setBitrixFields([]);
      setBitrixFieldsLoaded(false);
    } finally {
      setBitrixFieldsLoading(false);
    }
  }, [token, isNew, integrationId, initialIntegration?.dest_credentials_set, state.destCredentials]);

  const loadBitrixFunnels = useCallback(async () => {
    if (!token) return;
    const hasNewUrl = state.destCredentials.trim().length > 0;
    const hasSavedCreds = !isNew && initialIntegration?.dest_credentials_set;
    if (!hasNewUrl && !hasSavedCreds) return;
    setBitrixFunnelsLoading(true);
    try {
      const result = hasNewUrl
        ? await getBitrixFunnels(state.destCredentials.trim(), token)
        : await getBitrixFunnelsByIntegration(integrationId, token);
      setBitrixFunnels(result.funnels);
    } catch {
      setBitrixFunnels([]);
    } finally {
      setBitrixFunnelsLoading(false);
    }
  }, [token, isNew, integrationId, initialIntegration?.dest_credentials_set, state.destCredentials]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    if (state.sourceType !== "facebook") return;
    if (!state.sourceFormId || !state.sourceConnectionId || !state.sourcePageId) {
      setSourceFields([]);
      setSourceFieldsError(null);
      return;
    }
    let cancelled = false;
    setSourceFieldsLoading(true);
    setSourceFieldsError(null);
    void getFacebookFormFields(
      state.sourceFormId,
      { connectionId: state.sourceConnectionId, pageId: state.sourcePageId },
      token,
    )
      .then((result) => {
        if (cancelled) return;
        setSourceFields(result.fields);
        if (result.fields.length === 0) setSourceFieldsError("Facebook formda maydonlar topilmadi.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSourceFields([]);
        setSourceFieldsError(err instanceof Error ? err.message : "Facebook maydonlari yuklanmadi");
      })
      .finally(() => { if (!cancelled) setSourceFieldsLoading(false); });
    return () => { cancelled = true; };
  }, [token, state.sourceConnectionId, state.sourceFormId, state.sourcePageId, state.sourceType]);

  useEffect(() => {
    if (!token) return;
    if (state.sourceType !== "google_forms") return;
    if (!state.sourceConnectionId || !state.sourceFormId) { setSourceFields([]); return; }
    let cancelled = false;
    setSourceFieldsLoading(true);
    setSourceFieldsError(null);
    void getGoogleFormFields(state.sourceConnectionId, state.sourceFormId, token)
      .then((result) => {
        if (cancelled) return;
        setSourceFields(result.fields);
        if (result.fields.length === 0) setSourceFieldsError("Google formda maydonlar topilmadi.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSourceFields([]);
        setSourceFieldsError(err instanceof Error ? err.message : "Google forma maydonlari yuklanmadi");
      })
      .finally(() => { if (!cancelled) setSourceFieldsLoading(false); });
    return () => { cancelled = true; };
  }, [token, state.sourceConnectionId, state.sourceFormId, state.sourceType]);

  useEffect(() => {
    if (!token) return;
    if (state.sourceType !== "google_forms") return;
    if (!state.sourceConnectionId) { setGoogleForms([]); return; }
    let cancelled = false;
    setGoogleFormsLoading(true);
    void getGoogleForms(state.sourceConnectionId, token)
      .then((result) => {
        if (cancelled) return;
        setGoogleForms(result.forms);
        if (!state.sourceFormId && result.forms.length > 0) {
          setState((prev) => ({ ...prev, sourceFormId: result.forms[0].id }));
        }
      })
      .catch(() => { if (!cancelled) setGoogleForms([]); })
      .finally(() => { if (!cancelled) setGoogleFormsLoading(false); });
    return () => { cancelled = true; };
  }, [token, state.sourceConnectionId, state.sourceType]);

  useEffect(() => {
    if (!token) return;
    if (state.destType !== "google_sheets") return;
    if (state.googleSpreadsheetMode !== "existing") return;
    if (!state.destConnectionId || !state.destResourceId) {
      setGoogleSpreadsheetTabs([]);
      setGoogleSheetHeaders([]);
      return;
    }
    let cancelled = false;
    setGoogleSheetMetaLoading(true);
    void getGoogleSpreadsheetMeta(
      { connection_id: state.destConnectionId, spreadsheet_id: state.destResourceId, sheet_name: state.destSheetName || undefined },
      token,
    )
      .then((meta) => {
        if (cancelled) return;
        setGoogleSpreadsheetTabs(meta.sheets.map((s) => s.name).filter(Boolean));
        setGoogleSheetHeaders(meta.headers);
        setState((prev) => ({
          ...prev,
          destSheetName: meta.selected_sheet_name || prev.destSheetName || "Sheet1",
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setGoogleSpreadsheetTabs([]);
        setGoogleSheetHeaders([]);
      })
      .finally(() => { if (!cancelled) setGoogleSheetMetaLoading(false); });
    return () => { cancelled = true; };
  }, [token, state.destType, state.googleSpreadsheetMode, state.destConnectionId, state.destResourceId, state.destSheetName]);

  // Auto-load Bitrix fields on edit
  useEffect(() => {
    if (!token || isNew) return;
    if (state.destType !== "bitrix24") return;
    if (!state.destCredentials.trim()) return;
    if (bitrixFieldsLoaded || bitrixFieldsLoading) return;
    void loadBitrixFields();
  }, [token, isNew, state.destType, state.destCredentials, bitrixFieldsLoaded, bitrixFieldsLoading, loadBitrixFields]);

  // Auto-load Bitrix funnels when credentials change
  useEffect(() => {
    if (!token) return;
    if (state.destType !== "bitrix24") return;
    if (!state.destCredentials.trim()) return;
    void loadBitrixFunnels();
  }, [token, state.destType, state.destCredentials, loadBitrixFunnels]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const facebookConnections = useMemo(
    () => connections.filter((c) => c.provider === "facebook"),
    [connections],
  );

  const selectedFbConnection = useMemo(
    () => facebookConnections.find((c) => c.id === state.sourceConnectionId) ?? null,
    [facebookConnections, state.sourceConnectionId],
  );

  const sourcePageName = useMemo(() => {
    const pages = (((selectedFbConnection?.meta ?? {}) as { pages?: Array<{ id: string; name: string }> }).pages ?? []);
    return pages.find((p) => p.id === state.sourcePageId)?.name ?? null;
  }, [selectedFbConnection, state.sourcePageId]);

  const googleFormName = useMemo(
    () => googleForms.find((f) => f.id === state.sourceFormId)?.name ?? null,
    [googleForms, state.sourceFormId],
  );

  const sourceName = useMemo(() => {
    if (state.sourceType === "facebook") return sourcePageName;
    return googleFormName;
  }, [state.sourceType, sourcePageName, googleFormName]);

  const mappingCount = useMemo(
    () => mappingRows.filter((r) => r.sourceField && r.destinationField).length,
    [mappingRows],
  );

  const sublabels: StepSublabels = {
    sourceName,
    destName: state.destType ?? null,
    mappingCount,
    integrationName: state.name || null,
  };

  // ── Action handlers (continued) ─────────────────────────────────────────────

  function handleSourceTypeChange(type: "facebook" | "google_forms") {
    patch({ sourceType: type, sourceConnectionId: "", sourcePageId: "", sourceFormId: "" });
    setSourceFields([]);
    setSourceFieldsError(null);
    setMappingRows([]);
  }

  function handleDestTypeChange(type: "bitrix24" | "amocrm" | "google_sheets") {
    patch({
      destType: type,
      destConnectionId: "",
      destCredentials: "",
      destResourceId: "",
      destSheetName: "Sheet1",
      destFunnelId: "",
      googleSpreadsheetMode: "existing",
      googleCreatedSpreadsheetUrl: "",
    });
    setBitrixFields([]);
    setBitrixFieldsLoaded(false);
    setBitrixFunnels([]);
    setMappingRows([]);
    setGoogleSpreadsheetTabs([]);
    setGoogleSheetHeaders([]);
  }

  async function handleCreateGoogleSheet() {
    if (!token || !state.destConnectionId) return;
    setCreatingSheet(true);
    try {
      const created = await createGoogleSpreadsheet(
        {
          connection_id: state.destConnectionId,
          spreadsheet_name: state.googleCreateSpreadsheetName.trim() || undefined,
          sheet_name: state.googleCreateSheetName.trim() || undefined,
          header_mode: state.googleHeaderMode,
          source_fields: sourceFields.map((f) => ({ key: f.key, label: f.label })),
        },
        token,
      );
      patch({
        destResourceId: created.spreadsheet.id,
        destSheetName: created.spreadsheet.sheet_name || state.googleCreateSheetName || "Leads",
        googleCreatedSpreadsheetUrl: created.spreadsheet.url,
      });
    } catch {
      // silently fail
    } finally {
      setCreatingSheet(false);
    }
  }

  function navigateToStep(step: EditorStep) {
    setActiveStep(step);
    setVisitedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }

  function onMappingRowAdd() { setMappingRows((prev) => [...prev, newMappingRow()]); }
  function onMappingRowRemove(id: string) { setMappingRows((prev) => prev.filter((r) => r.id !== id)); }
  function onMappingRowUpdate(id: string, p: Partial<MappingRow>) { setMappingRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r))); }

  // ── Build payload ───────────────────────────────────────────────────────────

  function buildPayload(): CreateIntegrationInput {
    const fieldMapping: Record<string, string> = {};
    if (state.destType === "bitrix24") {
      for (const row of mappingRows) {
        if (row.sourceField && row.destinationField) fieldMapping[row.sourceField] = row.destinationField;
      }
    }
    return {
      name: state.name.trim() || "Nomsiz integratsiya",
      source_type: state.sourceType,
      source_connection_id: state.sourceConnectionId || undefined,
      source_page_id: state.sourceType === "facebook" ? state.sourcePageId : undefined,
      source_page_access_token: undefined,
      source_form_id: state.sourceFormId || null,
      dest_type: state.destType,
      dest_connection_id: state.destType === "google_sheets" ? state.destConnectionId : undefined,
      dest_resource_id: state.destType === "google_sheets" ? state.destResourceId : undefined,
      dest_sheet_name: state.destType === "google_sheets" ? (state.destSheetName || "Sheet1") : undefined,
      dest_credentials: (state.destType !== "google_sheets" && state.destCredentials.trim())
        ? state.destCredentials.trim()
        : undefined,
      // send null (not undefined) so UPDATE clears a previously set funnel
      dest_funnel_id: state.destFunnelId || null,
      field_mapping: fieldMapping,
      notify_telegram_chat_id: state.notifyTelegramChatId.trim() || null,
      dedup_enabled: state.dedupEnabled,
      dedup_field: state.dedupField,
    };
  }

  // ── Client-side validation ──────────────────────────────────────────────────

  function validateBeforeSave(): string | null {
    // Step 1 — Source
    if (state.sourceType === "facebook") {
      if (!state.sourceConnectionId) return "1-bosqich: Facebook ulanishni tanlang";
      if (!state.sourcePageId) return "1-bosqich: Facebook sahifasini tanlang";
    }
    if (state.sourceType === "google_forms") {
      if (!state.sourceConnectionId) return "1-bosqich: Google ulanishni tanlang";
      if (!state.sourceFormId) return "1-bosqich: Google formani tanlang";
    }
    // Step 2 — Destination
    if (state.destType === "bitrix24") {
      // Allow saving if credentials were already stored (edit mode) — backend keeps the existing value
      const credsSaved = initialIntegration?.dest_credentials_set;
      if (!state.destCredentials.trim() && !credsSaved) {
        return "2-bosqich: Bitrix24 webhook URL kiriting";
      }
    }
    if (state.destType === "google_sheets") {
      if (!state.destConnectionId) return "2-bosqich: Google ulanishni tanlang";
      if (!state.destResourceId) {
        return state.googleSpreadsheetMode === "create"
          ? "2-bosqich: \"Jadval yaratish\" tugmasini bosing"
          : "2-bosqich: Google Sheets jadvalini tanlang";
      }
    }
    return null;
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!token) return;

    const validationError = validateBeforeSave();
    if (validationError) {
      setSaveStatus("error");
      setSaveError(validationError);
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);
    try {
      if (state.destType === "google_sheets" && state.googleSpreadsheetMode === "existing" && state.destResourceId) {
        await syncGoogleSpreadsheetColumns(
          {
            connection_id: state.destConnectionId,
            spreadsheet_id: state.destResourceId,
            sheet_name: state.destSheetName || "Sheet1",
            columns: [],
          },
          token,
        ).catch(() => null);
      }
      const payload = buildPayload();
      if (isNew) {
        await createIntegration(payload, token);
      } else {
        await updateIntegration(integrationId, payload, token);
      }
      setSaveStatus("saved");
      scheduleResetSaveStatus();
      router.push("/integrations");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Saqlashda xato yuz berdi");
    }
  }

  function scheduleResetSaveStatus() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!ready || connectionsQuery.isLoading) {
    return <PageLoading />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <EditorTopbar
        name={state.name}
        active={state.active}
        saveStatus={saveStatus}
        isNew={isNew}
        onNameChange={(v) => patch({ name: v })}
        onActiveToggle={() => patch({ active: !state.active })}
        onSave={handleSave}
      />

      <FlowBanner
        sourceType={state.sourceType ?? null}
        sourceName={sourceName}
        destType={state.destType ?? null}
        destName={state.destType ?? null}
        mappingCount={mappingCount}
      />

      {saveError && (
        <div className="border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-5 py-2.5 text-sm text-[var(--danger)]">
          {saveError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <StepRail
          activeStep={activeStep}
          visitedSteps={visitedSteps}
          sublabels={sublabels}
          onStepClick={navigateToStep}
        />

        <main className="flex-1 overflow-auto p-5 lg:px-8 lg:py-6">
          <div className="mx-auto max-w-2xl">
            {activeStep === 1 && (
              <StepSource
                sourceType={state.sourceType}
                sourceConnectionId={state.sourceConnectionId}
                sourcePageId={state.sourcePageId}
                sourceFormId={state.sourceFormId}
                connections={connections}
                googleForms={googleForms}
                googleFormsLoading={googleFormsLoading}
                onSourceTypeChange={handleSourceTypeChange}
                onConnectionChange={(id) => patch({ sourceConnectionId: id, sourcePageId: "", sourceFormId: "" })}
                onPageChange={(id) => patch({ sourcePageId: id, sourceFormId: "" })}
                onFormChange={(id) => patch({ sourceFormId: id })}
              />
            )}

            {activeStep === 2 && (
              <StepDestination
                destType={state.destType}
                destCredentials={state.destCredentials}
                destCredentialsSet={initialIntegration?.dest_credentials_set}
                destConnectionId={state.destConnectionId}
                destResourceId={state.destResourceId}
                destSheetName={state.destSheetName}
                destFunnelId={state.destFunnelId}
                googleSpreadsheetMode={state.googleSpreadsheetMode}
                googleCreateSpreadsheetName={state.googleCreateSpreadsheetName}
                googleCreateSheetName={state.googleCreateSheetName}
                googleHeaderMode={state.googleHeaderMode}
                googleSpreadsheetTabs={googleSpreadsheetTabs}
                googleSheetMetaLoading={googleSheetMetaLoading}
                bitrixFieldsCount={bitrixFields.length}
                bitrixFieldsLoading={bitrixFieldsLoading}
                bitrixFieldsLoaded={bitrixFieldsLoaded}
                bitrixFunnels={bitrixFunnels}
                bitrixFunnelsLoading={bitrixFunnelsLoading}
                connections={connections}
                creatingSheet={creatingSheet}
                googleCreatedSpreadsheetUrl={state.googleCreatedSpreadsheetUrl}
                onDestTypeChange={handleDestTypeChange}
                onCredentialsChange={(v) => patch({ destCredentials: v })}
                onLoadBitrixFields={loadBitrixFields}
                onFunnelChange={(id) => patch({ destFunnelId: id })}
                onConnectionChange={(id) => patch({ destConnectionId: id, destResourceId: "" })}
                onResourceIdChange={(id) => patch({ destResourceId: id })}
                onSheetNameChange={(name) => patch({ destSheetName: name })}
                onSpreadsheetModeChange={(mode) => patch({ googleSpreadsheetMode: mode })}
                onCreateSpreadsheetNameChange={(v) => patch({ googleCreateSpreadsheetName: v })}
                onCreateSheetNameChange={(v) => patch({ googleCreateSheetName: v })}
                onHeaderModeChange={(mode) => patch({ googleHeaderMode: mode })}
                onCreateGoogleSheet={handleCreateGoogleSheet}
              />
            )}

            {activeStep === 3 && (
              <StepMapping
                destType={state.destType}
                sourceFields={sourceFields}
                sourceFieldsLoading={sourceFieldsLoading}
                sourceFieldsError={sourceFieldsError}
                bitrixFields={bitrixFields}
                mappingRows={mappingRows}
                onMappingRowsReplace={setMappingRows}
                onMappingRowAdd={onMappingRowAdd}
                onMappingRowRemove={onMappingRowRemove}
                onMappingRowUpdate={onMappingRowUpdate}
              />
            )}

            {activeStep === 4 && (
              <StepSettings
                name={state.name}
                notifyTelegramChatId={state.notifyTelegramChatId}
                dedupEnabled={state.dedupEnabled}
                dedupField={state.dedupField}
                onNameChange={(v) => patch({ name: v })}
                onTelegramChange={(v) => patch({ notifyTelegramChatId: v })}
                onDedupEnabledChange={(v) => patch({ dedupEnabled: v })}
                onDedupFieldChange={(v) => patch({ dedupField: v })}
              />
            )}

            <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-5">
              <button
                className="btn-ghost gap-1.5"
                onClick={() => activeStep > 1 && navigateToStep((activeStep - 1) as EditorStep)}
                disabled={activeStep === 1}
                type="button"
              >
                ← Orqaga
              </button>
              {activeStep < 4 ? (
                <button
                  className="btn-primary gap-1.5"
                  onClick={() => navigateToStep((activeStep + 1) as EditorStep)}
                  type="button"
                >
                  Keyingi →
                </button>
              ) : (
                <button
                  className="btn-primary gap-1.5"
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  type="button"
                >
                  Saqlash
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
