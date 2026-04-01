"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataPlaceholder } from "@/components/data-placeholder";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PageLoading } from "@/components/page-loading";
import { QueryBoundary } from "@/components/query-boundary";
import { StatusPill } from "@/components/status-pill";
import {
  createIntegration,
  createGoogleSpreadsheet,
  getBitrixLeadFields,
  getConnections,
  getFacebookFormFields,
  getGoogleFormFields,
  getGoogleSpreadsheetMeta,
  getGoogleForms,
  getIntegrations,
  syncGoogleSpreadsheetColumns,
  toggleIntegration,
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
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Power, Save, X } from "lucide-react";
import bitrixIcon from "@/asstes/icons/bitrix.png";
import amocrmIcon from "@/asstes/icons/amocrm.png";
import sheetsIcon from "@/asstes/icons/sheets.png";

type WizardStep = 1 | 2 | 3 | 4;

interface WizardState {
  sourceType: "facebook" | "google_forms";
  sourceConnectionId: string;
  sourcePageId: string;
  sourceFormId: string;
  integrationName: string;
  notifyTelegramChatId: string;
  destType: "bitrix24" | "amocrm" | "google_sheets";
  destConnectionId: string;
  googleSpreadsheetMode: "existing" | "create";
  googleCreateSpreadsheetName: string;
  googleCreateSheetName: string;
  googleHeaderMode: "default" | "custom" | "none";
  googleCreatedSpreadsheetUrl: string;
  destResourceId: string;
  destSheetName: string;
  destCredentials: string;
  dedupEnabled: boolean;
  dedupField: "phone" | "email";
}

interface MappingRow {
  id: string;
  sourceField: string;
  destinationField: string;
}

interface GoogleColumnRow {
  id: string;
  sourceField: string;
  columnTitle: string;
}

interface GoogleSheetMappingRow {
  id: string;
  sourceField: string;
  selectedHeader: string;
  customHeader: string;
}

interface SelectOption {
  value: string;
  label: string;
}

function UiDropdown({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
}: {
  label?: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onChange: (nextValue: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="relative">
      {label ? <label className="label">{label}</label> : null}
      <button
        className="field flex items-center justify-between text-left"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        type="button"
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
      </button>

      {open ? (
        <div className="scrollbar-ui absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          <button
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            type="button"
          >
            {placeholder}
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-soft)] ${
                value === option.value ? "bg-[var(--surface-soft)] font-medium text-[var(--text-primary)]" : "text-[var(--text-primary)]"
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const INITIAL_WIZARD: WizardState = {
  sourceType: "facebook",
  sourceConnectionId: "",
  sourcePageId: "",
  sourceFormId: "",
  integrationName: "",
  notifyTelegramChatId: "",
  destType: "bitrix24",
  destConnectionId: "",
  googleSpreadsheetMode: "existing",
  googleCreateSpreadsheetName: "",
  googleCreateSheetName: "Leads",
  googleHeaderMode: "default",
  googleCreatedSpreadsheetUrl: "",
  destResourceId: "",
  destSheetName: "Sheet1",
  destCredentials: "",
  dedupEnabled: true,
  dedupField: "phone",
};

function emptyMappingRow(): MappingRow {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `map_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceField: "",
    destinationField: "",
  };
}

function emptyGoogleColumnRow(): GoogleColumnRow {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `gcol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceField: "",
    columnTitle: "",
  };
}

function emptyGoogleSheetMappingRow(): GoogleSheetMappingRow {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `gmap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceField: "",
    selectedHeader: "",
    customHeader: "",
  };
}

function IntegrationsContent() {
  const { token, ready } = useAuthToken();
  const query = useApiQuery<Integration[]>(
    ["integrations-v4", token],
    () => getIntegrations(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 20_000 },
  );
  const connectionsQuery = useApiQuery<ConnectionSummary[]>(
    ["connections-v1", token],
    () => getConnections(token!),
    { enabled: ready && Boolean(token), throwOnError: true, staleMs: 15_000 },
  );

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [wizard, setWizard] = useState<WizardState>(INITIAL_WIZARD);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<{ id: string; active: boolean } | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bitrixFields, setBitrixFields] = useState<BitrixLeadField[]>([]);
  const [sourceFields, setSourceFields] = useState<FacebookSourceField[]>([]);
  const [sourceFieldsLoading, setSourceFieldsLoading] = useState(false);
  const [sourceFieldsError, setSourceFieldsError] = useState<string | null>(null);
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const [googleColumnRows, setGoogleColumnRows] = useState<GoogleColumnRow[]>([]);
  const [googleSpreadsheetTabs, setGoogleSpreadsheetTabs] = useState<string[]>([]);
  const [googleSheetHeaders, setGoogleSheetHeaders] = useState<string[]>([]);
  const [googleSheetMetaLoading, setGoogleSheetMetaLoading] = useState(false);
  const [googleSheetMappings, setGoogleSheetMappings] = useState<GoogleSheetMappingRow[]>([]);
  const [googleSourceForms, setGoogleSourceForms] = useState<GoogleFormOption[]>([]);
  const [googleSourceFormsLoading, setGoogleSourceFormsLoading] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [editName, setEditName] = useState("");
  const [editDedupEnabled, setEditDedupEnabled] = useState(true);
  const [editDedupField, setEditDedupField] = useState<"phone" | "email">("phone");
  const [editNotifyChatId, setEditNotifyChatId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const rows = query.data ?? [];
  const connections = connectionsQuery.data ?? [];
  const facebookConnections = connections.filter((c) => c.provider === "facebook");
  const googleConnections = connections.filter((c) => c.provider === "google");
  const selectedSourceConnection = facebookConnections.find((c) => c.id === wizard.sourceConnectionId) ?? null;
  const sourcePages = (((selectedSourceConnection?.meta ?? {}) as { pages?: Array<{ id: string; name: string; forms?: Array<{ id: string; name: string }> }> }).pages ?? []);
  const selectedPage = sourcePages.find((p) => p.id === wizard.sourcePageId) ?? null;
  const selectedDestGoogleConnection = googleConnections.find((c) => c.id === wizard.destConnectionId) ?? null;
  const googleSpreadsheets = (((selectedDestGoogleConnection?.meta ?? {}) as { spreadsheets?: Array<{ id: string; name: string }> }).spreadsheets ?? []);
  const googleSourceFieldOptions: SelectOption[] = useMemo(() => (
    sourceFields.length > 0
      ? sourceFields.map((field) => ({ value: field.key, label: field.label }))
      : [
        { value: "full_name", label: "Full Name" },
        { value: "phone_number", label: "Phone Number" },
        { value: "email", label: "Email" },
        { value: "city", label: "City" },
        { value: "state", label: "State / Region" },
        { value: "country", label: "Country" },
        { value: "company_name", label: "Company Name" },
        { value: "job_title", label: "Job Title" },
      ]
  ), [sourceFields]);
  const googleSheetTargetOptions: SelectOption[] = useMemo(
    () => [
      ...googleSheetHeaders.map((header) => ({ value: header, label: header })),
      { value: "__new__", label: "+ Yangi ustun yaratish" },
    ],
    [googleSheetHeaders],
  );

  function handleDestinationTypeChange(nextDest: WizardState["destType"]) {
    setWizard((p) => ({
      ...p,
      destType: nextDest,
      destConnectionId: "",
      googleSpreadsheetMode: "existing",
      googleCreateSpreadsheetName: "",
      googleCreateSheetName: "Leads",
      googleHeaderMode: "default",
      destResourceId: "",
      destSheetName: "Sheet1",
    }));
    setBitrixFields([]);
    setSourceFields([]);
    setSourceFieldsError(null);
    setMappingRows([]);
    setGoogleColumnRows([]);
    setGoogleSpreadsheetTabs([]);
    setGoogleSheetHeaders([]);
    setGoogleSheetMappings([]);
  }

  function handleSourceTypeChange(nextSource: WizardState["sourceType"]) {
    setWizard((p) => ({
      ...p,
      sourceType: nextSource,
      sourceConnectionId: "",
      sourcePageId: "",
      sourceFormId: "",
    }));
    setSourceFields([]);
    setSourceFieldsError(null);
    setMappingRows([]);
  }

  const canContinueStep1 = useMemo(
    () => (
      wizard.sourceType === "facebook"
        ? Boolean(wizard.sourceConnectionId && selectedPage)
        : Boolean(wizard.sourceConnectionId && wizard.sourceFormId.trim())
    ),
    [selectedPage, wizard.sourceConnectionId, wizard.sourceFormId, wizard.sourceType],
  );

  const canContinueStep2 = useMemo(
    () => Boolean(wizard.integrationName.trim()),
    [wizard.integrationName],
  );

  const hasIncompleteGoogleSheetMappings = useMemo(
    () => googleSheetMappings.some((row) => {
      const target = row.selectedHeader === "__new__"
        ? row.customHeader.trim()
        : row.selectedHeader.trim();
      return !row.sourceField || !target;
    }),
    [googleSheetMappings],
  );

  const canContinueStep3 = useMemo(() => {
    if (wizard.destType === "google_sheets") {
      if (!wizard.destConnectionId) return false;
      if (wizard.googleSpreadsheetMode === "existing") {
        return Boolean(
          wizard.destResourceId &&
          wizard.destSheetName.trim() &&
          googleSheetMappings.length > 0 &&
          !hasIncompleteGoogleSheetMappings,
        );
      }
      return Boolean(wizard.destResourceId && wizard.destSheetName.trim());
    }
    return Boolean(wizard.destCredentials.trim());
  }, [
    wizard.destConnectionId,
    wizard.destCredentials,
    wizard.destResourceId,
    wizard.destSheetName,
    wizard.destType,
    wizard.googleSpreadsheetMode,
    googleSheetMappings.length,
    hasIncompleteGoogleSheetMappings,
  ]);

  const hasIncompleteMappingRows = useMemo(
    () => mappingRows.some((row) => !row.sourceField || !row.destinationField),
    [mappingRows],
  );

  const canSaveStep4 = useMemo(() => {
    if (wizard.destType === "google_sheets") {
      if (wizard.googleSpreadsheetMode === "existing") {
        return googleSheetMappings.length > 0 && !hasIncompleteGoogleSheetMappings;
      }
      return true;
    }
    if (wizard.destType !== "bitrix24") return true;
    return (
      bitrixFields.length > 0 &&
      mappingRows.length > 0 &&
      !hasIncompleteMappingRows &&
      (
        wizard.sourceType === "google_forms"
          ? Boolean(wizard.sourceFormId.trim())
          : (Boolean(wizard.sourceFormId) && sourceFields.length > 0)
      )
    );
  }, [
    bitrixFields.length,
    googleSheetMappings.length,
    hasIncompleteGoogleSheetMappings,
    hasIncompleteMappingRows,
    mappingRows.length,
    sourceFields.length,
    wizard.destType,
    wizard.sourceType,
    wizard.googleSpreadsheetMode,
    wizard.sourceFormId,
  ]);

  function resetWizard() {
    setOpen(false);
    setStep(1);
    setWizard(INITIAL_WIZARD);
    setBitrixFields([]);
    setSourceFields([]);
    setSourceFieldsError(null);
    setMappingRows([]);
    setGoogleColumnRows([]);
    setGoogleSpreadsheetTabs([]);
    setGoogleSheetHeaders([]);
    setGoogleSheetMappings([]);
    setError(null);
    setSaving(false);
    setFieldsLoading(false);
  }

  useEffect(() => {
    if (!token || !open) return;
    if (wizard.sourceType !== "facebook") return;

    if (!wizard.sourceFormId || !wizard.sourceConnectionId || !wizard.sourcePageId) {
      setSourceFields([]);
      setSourceFieldsError(null);
      return;
    }

    let cancelled = false;
    setSourceFieldsLoading(true);
    setSourceFieldsError(null);

    void getFacebookFormFields(
      wizard.sourceFormId,
      {
        connectionId: wizard.sourceConnectionId,
        pageId: wizard.sourcePageId,
      },
      token,
    )
      .then((result) => {
        if (cancelled) return;
        setSourceFields(result.fields);
        if (result.fields.length === 0) {
          setSourceFieldsError("Facebook formda mapping uchun maydonlar topilmadi.");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSourceFields([]);
        setSourceFieldsError(err instanceof Error ? err.message : "Facebook maydonlarini yuklashda xato");
      })
      .finally(() => {
        if (!cancelled) setSourceFieldsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, token, wizard.sourceConnectionId, wizard.sourceFormId, wizard.sourcePageId, wizard.sourceType]);

  useEffect(() => {
    if (!token || !open) return;
    if (wizard.sourceType !== "google_forms") return;
    if (!wizard.sourceConnectionId || !wizard.sourceFormId) {
      setSourceFields([]);
      setSourceFieldsError(null);
      return;
    }

    let cancelled = false;
    setSourceFieldsLoading(true);
    setSourceFieldsError(null);

    void getGoogleFormFields(wizard.sourceConnectionId, wizard.sourceFormId, token)
      .then((result) => {
        if (cancelled) return;
        setSourceFields(result.fields);
        if (result.fields.length === 0) {
          setSourceFieldsError("Google formda mapping uchun maydonlar topilmadi.");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSourceFields([]);
        setSourceFieldsError(err instanceof Error ? err.message : "Google forma maydonlarini yuklashda xato");
      })
      .finally(() => {
        if (!cancelled) setSourceFieldsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, token, wizard.sourceConnectionId, wizard.sourceFormId, wizard.sourceType]);

  useEffect(() => {
    if (!open || !token) return;
    if (wizard.sourceType !== "google_forms") return;
    if (!wizard.sourceConnectionId) {
      setGoogleSourceForms([]);
      return;
    }

    let cancelled = false;
    setGoogleSourceFormsLoading(true);
    setError(null);

    void getGoogleForms(wizard.sourceConnectionId, token)
      .then((result) => {
        if (cancelled) return;
        setGoogleSourceForms(result.forms);
        setWizard((prev) => (
          prev.sourceFormId || result.forms.length === 0
            ? prev
            : { ...prev, sourceFormId: result.forms[0].id }
        ));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setGoogleSourceForms([]);
        setError(err instanceof Error ? err.message : "Google form ro'yxatini olishda xato");
      })
      .finally(() => {
        if (!cancelled) setGoogleSourceFormsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, token, wizard.sourceConnectionId, wizard.sourceType]);

  useEffect(() => {
    if (!open || !token) return;
    if (wizard.destType !== "google_sheets") return;
    if (wizard.googleSpreadsheetMode !== "existing") return;
    if (!wizard.destConnectionId || !wizard.destResourceId) {
      setGoogleSpreadsheetTabs([]);
      setGoogleSheetHeaders([]);
      setGoogleSheetMappings([]);
      return;
    }

    let cancelled = false;
    setGoogleSheetMetaLoading(true);
    setError(null);

    void getGoogleSpreadsheetMeta(
      {
        connection_id: wizard.destConnectionId,
        spreadsheet_id: wizard.destResourceId,
        sheet_name: wizard.destSheetName || undefined,
      },
      token,
    )
      .then((meta) => {
        if (cancelled) return;
        const tabs = meta.sheets.map((item) => item.name).filter(Boolean);
        setGoogleSpreadsheetTabs(tabs);
        setGoogleSheetHeaders(meta.headers);
        setWizard((prev) => ({
          ...prev,
          destSheetName: meta.selected_sheet_name || prev.destSheetName || "Sheet1",
        }));
        setGoogleSheetMappings((prev) => {
          if (prev.length > 0) return prev;
          const normalizedHeaders = new Set(meta.headers.map((header) => header.toLowerCase()));
          const initial = googleSourceFieldOptions
            .map((source) => {
              const expected = source.label.trim();
              const has = normalizedHeaders.has(expected.toLowerCase());
              return {
                id: emptyGoogleSheetMappingRow().id,
                sourceField: source.value,
                selectedHeader: has ? expected : "__new__",
                customHeader: has ? "" : expected,
              };
            })
            .filter((row) => row.selectedHeader || row.customHeader)
            .slice(0, 8);
          return initial.length > 0 ? initial : [emptyGoogleSheetMappingRow()];
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setGoogleSpreadsheetTabs([]);
        setGoogleSheetHeaders([]);
        setGoogleSheetMappings([]);
        setError(err instanceof Error ? err.message : "Google sheet ma'lumotlarini olishda xato");
      })
      .finally(() => {
        if (!cancelled) setGoogleSheetMetaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    token,
    wizard.destType,
    wizard.googleSpreadsheetMode,
    wizard.destConnectionId,
    wizard.destResourceId,
    wizard.destSheetName,
    googleSourceFieldOptions,
  ]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (step !== 4) {
      setError("Avval 4-bosqichgacha o'ting.");
      return;
    }

    if (wizard.sourceType === "facebook" && !selectedPage) {
      setError("Avval Facebook profile va sahifani tanlang.");
      return;
    }

    if (wizard.destType === "google_sheets") {
      if (!wizard.destConnectionId) {
        setError("Avval Ulanishlar bo'limidan Google profil ulang va tanlang.");
        return;
      }
      if (!wizard.destResourceId) {
        setError("Google spreadsheet tanlang.");
        return;
      }
      if (buildGoogleDestinationColumns().length === 0) {
        setError(wizard.googleSpreadsheetMode === "existing" ? "Sheet mapping qo'shing." : "Custom column mapping qo'shing.");
        return;
      }
    }

    if (wizard.destType === "bitrix24") {
      if (!wizard.sourceFormId) {
        setError("Mapping uchun aniq forma tanlang.");
        return;
      }
      if (wizard.sourceType === "facebook" && sourceFields.length === 0) {
        setError("Avval Facebook form maydonlari yuklansin.");
        return;
      }
      if (bitrixFields.length === 0) {
        setError("Avval Bitrix maydonlarini yuklang.");
        return;
      }
      if (mappingRows.length === 0) {
        setError("Kamida bitta field mapping qo'shing.");
        return;
      }
      if (hasIncompleteMappingRows) {
        setError("Mapping qatorlarini to'liq to'ldiring.");
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const fieldMapping = buildFieldMapping();
      const googleDestColumns = buildGoogleDestinationColumns();
      const destinationCredentials = wizard.destType === "google_sheets" ? undefined : wizard.destCredentials.trim();

      if (wizard.destType === "google_sheets" && wizard.googleSpreadsheetMode === "existing") {
        const uniqueColumns = Array.from(new Set(googleDestColumns.map((item) => item.column_title.trim()).filter(Boolean)));
        if (uniqueColumns.length === 0) {
          setError("Sheet mapping to'liq emas.");
          setSaving(false);
          return;
        }
        await syncGoogleSpreadsheetColumns(
          {
            connection_id: wizard.destConnectionId,
            spreadsheet_id: wizard.destResourceId,
            sheet_name: wizard.destSheetName || "Sheet1",
            columns: uniqueColumns,
          },
          token,
        );
      }

      const payload: CreateIntegrationInput = {
        name: wizard.integrationName.trim(),
        source_type: wizard.sourceType,
        source_connection_id: wizard.sourceConnectionId || undefined,
        source_page_id: wizard.sourceType === "facebook" ? wizard.sourcePageId : undefined,
        source_page_access_token: undefined,
        source_form_id: wizard.sourceFormId || null,
        dest_type: wizard.destType,
        dest_connection_id: wizard.destType === "google_sheets" ? wizard.destConnectionId : undefined,
        dest_resource_id: wizard.destType === "google_sheets" ? wizard.destResourceId : undefined,
        dest_sheet_name: wizard.destType === "google_sheets" ? (wizard.destSheetName || "Sheet1") : undefined,
        dest_columns: wizard.destType === "google_sheets" ? googleDestColumns : undefined,
        dest_credentials: destinationCredentials,
        field_mapping: wizard.destType === "google_sheets"
          ? Object.fromEntries(googleDestColumns.map((row) => [row.source_field, row.column_title]))
          : fieldMapping,
        notify_telegram_chat_id: wizard.notifyTelegramChatId.trim() || null,
        dedup_enabled: wizard.dedupEnabled,
        dedup_field: wizard.dedupField,
      };

      await createIntegration(payload, token);
      await query.refetch();
      resetWizard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Integration create xatosi");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleIntegration(integrationId: string, active: boolean) {
    if (!token) return;
    setPendingToggle({ id: integrationId, active });
  }

  async function confirmToggleIntegration() {
    if (!token || !pendingToggle) return;
    const integrationId = pendingToggle.id;
    setDeletingId(integrationId);
    setError(null);
    try {
      await toggleIntegration(integrationId, token);
      await query.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Integratsiya holatini o'zgartirishda xato");
    } finally {
      setDeletingId(null);
      setPendingToggle(null);
    }
  }

  function openEditDialog(row: Integration) {
    setEditingIntegration(row);
    setEditName(row.name);
    setEditDedupEnabled(row.dedup_enabled);
    setEditDedupField(row.dedup_field);
    setEditNotifyChatId(row.notify_telegram_chat_id ?? "");
    setError(null);
  }

  function closeEditDialog() {
    setEditingIntegration(null);
    setEditSaving(false);
  }

  async function saveEditIntegration() {
    if (!token || !editingIntegration) return;
    if (!editName.trim()) {
      setError("Integratsiya nomi bo'sh bo'lmasligi kerak.");
      return;
    }

    setEditSaving(true);
    setError(null);
    try {
      await updateIntegration(
        editingIntegration.id,
        {
          name: editName.trim(),
          dedup_enabled: editDedupEnabled,
          dedup_field: editDedupField,
          notify_telegram_chat_id: editNotifyChatId.trim() || null,
        },
        token,
      );
      await query.refetch();
      closeEditDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Integratsiyani yangilashda xato");
    } finally {
      setEditSaving(false);
    }
  }

  async function onLoadBitrixFields() {
    if (!token) return;
    if (wizard.destType !== "bitrix24") return;
    if (!wizard.destCredentials.trim()) {
      setError("Avval Bitrix24 Webhook URL kiriting.");
      return;
    }

    setFieldsLoading(true);
    setError(null);
    try {
      const result = await getBitrixLeadFields(wizard.destCredentials.trim(), token);
      setBitrixFields(result.fields);
      if (result.fields.length === 0) {
        setError("Bitrix24 maydonlari topilmadi.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bitrix24 maydonlarini yuklashda xato");
    } finally {
      setFieldsLoading(false);
    }
  }

  async function onCreateGoogleSheetInPlace() {
    if (!token) return;
    if (!wizard.destConnectionId) {
      setError("Avval Google ulanishni tanlang.");
      return;
    }

    setCreatingSheet(true);
    setError(null);
    try {
      const customMappings = buildGoogleDestinationColumns();
      if (wizard.googleHeaderMode === "custom" && customMappings.length === 0) {
        setError("Custom column mapping qo'shing.");
        setCreatingSheet(false);
        return;
      }
      const customHeaders = customMappings.map((row) => row.column_title);

      const created = await createGoogleSpreadsheet(
        {
          connection_id: wizard.destConnectionId,
          spreadsheet_name: wizard.googleCreateSpreadsheetName.trim() || undefined,
          sheet_name: wizard.googleCreateSheetName.trim() || undefined,
          header_mode: wizard.googleHeaderMode,
          custom_headers: wizard.googleHeaderMode === "custom" ? customHeaders : undefined,
          column_mappings: wizard.googleHeaderMode === "custom" ? customMappings : undefined,
          source_fields: sourceFields.map((field) => ({ key: field.key, label: field.label })),
        },
        token,
      );

      await connectionsQuery.refetch();

      setWizard((prev) => ({
        ...prev,
        destResourceId: created.spreadsheet.id,
        destSheetName: created.spreadsheet.sheet_name || prev.destSheetName,
        googleSpreadsheetMode: "create",
        googleCreatedSpreadsheetUrl: created.spreadsheet.url,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sheet yaratishda xato");
    } finally {
      setCreatingSheet(false);
    }
  }

  function onAddMappingRow() {
    if (!wizard.sourceFormId) {
      setError("Avval aniq forma tanlang.");
      return;
    }
    if (wizard.sourceType === "facebook" && sourceFields.length === 0) {
      setError("Facebook form maydonlari hali yuklanmagan.");
      return;
    }
    setMappingRows((prev) => [...prev, emptyMappingRow()]);
  }

  function onRemoveMappingRow(id: string) {
    setMappingRows((prev) => prev.filter((row) => row.id !== id));
  }

  function onUpdateMappingRow(id: string, patch: Partial<MappingRow>) {
    setMappingRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function onAddGoogleColumnRow() {
    setGoogleColumnRows((prev) => [...prev, emptyGoogleColumnRow()]);
  }

  function onRemoveGoogleColumnRow(id: string) {
    setGoogleColumnRows((prev) => prev.filter((row) => row.id !== id));
  }

  function onUpdateGoogleColumnRow(id: string, patch: Partial<GoogleColumnRow>) {
    setGoogleColumnRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function onAddGoogleSheetMappingRow() {
    setGoogleSheetMappings((prev) => [...prev, emptyGoogleSheetMappingRow()]);
  }

  function onRemoveGoogleSheetMappingRow(id: string) {
    setGoogleSheetMappings((prev) => prev.filter((row) => row.id !== id));
  }

  function onUpdateGoogleSheetMappingRow(id: string, patch: Partial<GoogleSheetMappingRow>) {
    setGoogleSheetMappings((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function buildFieldMapping(): Record<string, string> {
    if (wizard.destType !== "bitrix24") return {};

    const mapping: Record<string, string> = {};
    for (const row of mappingRows) {
      if (!row.sourceField || !row.destinationField) continue;
      mapping[row.sourceField] = row.destinationField;
    }
    return mapping;
  }

  function buildGoogleDestinationColumns(): Array<{ source_field: string; column_title: string }> {
    if (wizard.googleSpreadsheetMode === "existing") {
      return googleSheetMappings
        .map((row) => ({
          source_field: row.sourceField,
          column_title: row.selectedHeader === "__new__"
            ? row.customHeader.trim()
            : row.selectedHeader.trim(),
        }))
        .filter((row) => row.source_field && row.column_title);
    }
    if (wizard.googleHeaderMode === "none") return [];
    if (wizard.googleHeaderMode === "custom") {
      return googleColumnRows
        .filter((row) => row.sourceField && row.columnTitle.trim())
        .map((row) => ({ source_field: row.sourceField, column_title: row.columnTitle.trim() }));
    }
    return sourceFields.map((field) => ({
      source_field: field.key,
      column_title: field.label,
    }));
  }

  if (!ready || query.isLoading || connectionsQuery.isLoading) {
    return <PageLoading />;
  }

  const activeRows = rows.filter((row) => row.active);
  const inactiveRows = rows.filter((row) => !row.active);

  function renderIntegrationsTable(tableRows: Integration[]) {
    return (
      <div className="table-shell">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-3 py-3">Nomi</th>
              <th className="px-3 py-3">Holat</th>
              <th className="px-3 py-3">Manba</th>
              <th className="px-3 py-3">Maqsad</th>
              <th className="px-3 py-3">Sahifa / Forma</th>
              <th className="px-3 py-3">Yaratilgan</th>
              <th className="px-3 py-3 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.id} className="table-row">
                <td className="px-3 py-3">
                  <p className="font-semibold text-[var(--text-primary)]">{row.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">{row.id}</p>
                </td>
                <td className="px-3 py-3"><StatusPill status={row.active ? "active" : "disabled"} /></td>
                <td className="px-3 py-3">{row.source_type}</td>
                <td className="px-3 py-3">{row.dest_type}</td>
                <td className="px-3 py-3">
                  <p>{row.source_page_id ?? "-"}</p>
                  <p className="text-xs text-[var(--text-secondary)]">form: {row.source_form_id ?? "any"}</p>
                </td>
                <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-[#d4dbe7] bg-[#edf1f7] p-1.5 dark:border-[var(--border)] dark:bg-[var(--surface-soft)]">
                    <button
                      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#d1d9e6] bg-white px-3 text-xs font-semibold text-[#0f172a] shadow-sm transition hover:-translate-y-[1px] hover:bg-[#f8fafc] hover:shadow dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-[var(--text-primary)] dark:hover:bg-[var(--surface-soft)]"
                      onClick={() => openEditDialog(row)}
                      type="button"
                      title="Integratsiyani tahrirlash"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Tahrirlash
                    </button>
                    <button
                      className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow ${
                        row.active
                          ? "border border-[#c12a3e] bg-[#d33349] hover:bg-[#bf2a3e]"
                          : "border border-[#1a8d51] bg-[#1fa35d] hover:bg-[#188c4f]"
                      }`}
                      disabled={deletingId === row.id}
                      onClick={() => void onToggleIntegration(row.id, row.active)}
                      type="button"
                      title={row.active ? "Integratsiyani tugatish" : "Integratsiyani faollashtirish"}
                    >
                      <Power className="h-3.5 w-3.5" aria-hidden="true" />
                      {row.active ? "Tugatish" : "Faollashtirish"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <section className="panel-soft p-5">
        <div className="mb-4 flex justify-end">
          <button className="btn-primary" onClick={() => setOpen(true)} type="button">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Yangi integratsiya
          </button>
        </div>

        {rows.length === 0 ? (
          <DataPlaceholder
            title="Hali integratsiya yo'q"
            description="Birinchi Meta -> CRM integratsiyani qo'shish uchun 'Yangi integratsiya' tugmasini bosing."
          />
        ) : (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Faol integratsiyalar</p>
                <p className="text-xs text-[var(--text-secondary)]">{activeRows.length} ta</p>
              </div>
              {activeRows.length > 0 ? (
                renderIntegrationsTable(activeRows)
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  Hozircha faol integratsiya yo'q.
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Tugatilgan integratsiyalar</p>
                <p className="text-xs text-[var(--text-secondary)]">{inactiveRows.length} ta</p>
              </div>
              {inactiveRows.length > 0 ? (
                renderIntegrationsTable(inactiveRows)
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  Tugatilgan integratsiyalar topilmadi.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-2">
          <form className="flex min-h-[85vh] max-h-[calc(100vh-16px)] w-full max-w-4xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl" onSubmit={onSave}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-2xl font-semibold">Integratsiya qo'shish</h2>
              <button className="btn-ghost" onClick={resetWizard} type="button">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="scrollbar-ui min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                <div className="relative mb-4 h-2 rounded-full bg-[var(--border)]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--brand)] transition-all duration-300"
                    style={{ width: `${((step - 1) / 3) * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {[1, 2, 3, 4].map((n) => {
                    const isDone = step > n;
                    const isActive = step === n;
                    const label = n === 1 ? "Manba" : n === 2 ? "Forma" : n === 3 ? "Maqsad" : "Sozlama";
                    return (
                      <div key={n} className="flex flex-col items-center gap-2 text-center">
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold shadow-sm ${
                            isDone
                              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                              : isActive
                                ? "border-[var(--brand-soft)] bg-[var(--brand-soft)] text-white"
                                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
                        </span>
                        <span className={isActive || isDone ? "font-medium text-[var(--text-primary)]" : "font-medium text-[var(--text-secondary)]"}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {step === 1 ? (
                <section className="panel-soft p-4">
                  <p className="mb-3 text-lg font-semibold">1. Manba tanlash</p>
                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      className={`rounded-xl border p-3 text-left transition ${
                        wizard.sourceType === "facebook"
                          ? "border-[var(--brand)] bg-[var(--surface-soft)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
                      }`}
                      onClick={() => handleSourceTypeChange("facebook")}
                      type="button"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Meta Ads</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Facebook Lead Ads webhook orqali</p>
                    </button>
                    <button
                      className={`rounded-xl border p-3 text-left transition ${
                        wizard.sourceType === "google_forms"
                          ? "border-[var(--brand)] bg-[var(--surface-soft)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
                      }`}
                      onClick={() => handleSourceTypeChange("google_forms")}
                      type="button"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Google Forms</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Form submit qilinganda CRM'ga yuborish</p>
                    </button>
                  </div>

                  {wizard.sourceType === "facebook" ? (
                    <>
                      <p className="mb-3 text-sm text-[var(--text-secondary)]">
                        Avval profillarni <a className="text-[var(--brand)] underline" href="/connections">Ulanishlar</a> bo'limida ulang.
                      </p>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <UiDropdown
                            label="Facebook ulanish *"
                            value={wizard.sourceConnectionId}
                            placeholder="Ulanishni tanlang"
                            options={facebookConnections.map((connection) => ({ value: connection.id, label: connection.name }))}
                            onChange={(connectionId) => {
                              const conn = facebookConnections.find((c) => c.id === connectionId) ?? null;
                              const pages = (((conn?.meta ?? {}) as { pages?: Array<{ id: string; forms?: Array<{ id: string }> }> }).pages ?? []);
                              setMappingRows([]);
                              setSourceFields([]);
                              setSourceFieldsError(null);
                              setWizard((prev) => ({
                                ...prev,
                                sourceConnectionId: connectionId,
                                sourcePageId: pages[0]?.id ?? "",
                                sourceFormId: pages[0]?.forms?.[0]?.id ?? "",
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <UiDropdown
                            label="Sahifa *"
                            value={wizard.sourcePageId}
                            placeholder="Sahifani tanlang"
                            options={sourcePages.map((page) => ({ value: page.id, label: page.name }))}
                            onChange={(pageId) => {
                              const page = sourcePages.find((item) => item.id === pageId);
                              setMappingRows([]);
                              setSourceFields([]);
                              setSourceFieldsError(null);
                              setWizard((prev) => ({
                                ...prev,
                                sourcePageId: pageId,
                                sourceFormId: page?.forms?.[0]?.id ?? "",
                              }));
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <UiDropdown
                          label="Forma (mapping uchun kerak)"
                          value={wizard.sourceFormId}
                          placeholder="Any form"
                          options={(selectedPage?.forms ?? []).map((form) => ({ value: form.id, label: form.name }))}
                          onChange={(nextValue) => {
                            setWizard((prev) => ({ ...prev, sourceFormId: nextValue }));
                            setMappingRows([]);
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
                        Google OAuth polling ishlatiladi.
                        <br />
                        Ulangan Google profil orqali form javoblari avtomatik tekshiriladi.
                      </div>
                      <UiDropdown
                        label="Google ulanish *"
                        value={wizard.sourceConnectionId}
                        placeholder="Google ulanishni tanlang"
                        options={googleConnections.map((connection) => ({ value: connection.id, label: connection.name }))}
                        onChange={(connectionId) => setWizard((p) => ({ ...p, sourceConnectionId: connectionId, sourceFormId: "" }))}
                      />
                      <UiDropdown
                        label="Google forma *"
                        value={wizard.sourceFormId}
                        placeholder={googleSourceFormsLoading ? "Formalar yuklanmoqda..." : "Formani tanlang"}
                        options={googleSourceForms.map((form) => ({ value: form.id, label: form.name }))}
                        disabled={!wizard.sourceConnectionId || googleSourceFormsLoading}
                        onChange={(formId) => {
                          setSourceFields([]);
                          setSourceFieldsError(null);
                          setMappingRows([]);
                          setWizard((p) => ({ ...p, sourceFormId: formId }));
                        }}
                      />
                      {wizard.sourceConnectionId && !googleSourceFormsLoading && googleSourceForms.length === 0 ? (
                        <p className="text-xs text-[var(--text-secondary)]">
                          Bu accountda form topilmadi. Google Form yarating yoki ulanishni qayta tekshiring.
                        </p>
                      ) : null}
                      {wizard.sourceFormId ? (
                        <p className="text-xs text-[var(--text-secondary)]">
                          Forma tanlandi.
                        </p>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {step === 2 ? (
                <section className="panel-soft p-4">
                  <p className="mb-3 text-lg font-semibold">2. Asosiy sozlamalar</p>
                  <label className="label">Integration nomi *</label>
                  <input className="field" placeholder="Masalan: Meta Lead -> Bitrix Sales" value={wizard.integrationName} onChange={(e) => setWizard((p) => ({ ...p, integrationName: e.target.value }))} />
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="label">Telegram Chat ID (ixtiyoriy)</label>
                      <input className="field" value={wizard.notifyTelegramChatId} onChange={(e) => setWizard((p) => ({ ...p, notifyTelegramChatId: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Dedup field</label>
                      <UiDropdown
                        label=""
                        value={wizard.dedupField}
                        placeholder="Dedup field tanlang"
                        options={[
                          { value: "phone", label: "phone" },
                          { value: "email", label: "email" },
                        ]}
                        onChange={(nextValue) => setWizard((p) => ({ ...p, dedupField: nextValue as "phone" | "email" }))}
                      />
                    </div>
                  </div>
                  <button
                    className="mt-3 inline-flex items-center gap-2 text-sm"
                    onClick={() => setWizard((p) => ({ ...p, dedupEnabled: !p.dedupEnabled }))}
                    type="button"
                  >
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition ${
                        wizard.dedupEnabled ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--border)] bg-[var(--surface-soft)]"
                      }`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full shadow-sm transition ${
                          wizard.dedupEnabled ? "translate-x-5 bg-[var(--surface)]" : "translate-x-0 bg-[var(--text-secondary)]"
                        }`}
                      />
                    </span>
                    <span className={wizard.dedupEnabled ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}>
                      Duplicate tekshiruvni yoqish
                    </span>
                  </button>
                </section>
              ) : null}

              {step === 3 ? (
                <section className="panel-soft p-4">
                  <p className="mb-3 text-lg font-semibold">3. Maqsadli tizim</p>
                  <label className="label">Lead qayerga yuborilsin? *</label>
                  <div className="grid gap-2 md:grid-cols-3">
                    {([
                      { value: "bitrix24", title: "Bitrix24 CRM", icon: bitrixIcon, tone: "bg-[var(--info-soft)]" },
                      { value: "amocrm", title: "AmoCRM", icon: amocrmIcon, tone: "bg-[var(--surface-soft)]" },
                      { value: "google_sheets", title: "Google Sheets", icon: sheetsIcon, tone: "bg-[var(--success-soft)]" },
                    ] as const).map((item) => {
                      const active = wizard.destType === item.value;
                      return (
                        <button
                          key={item.value}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                            active ? "border-[var(--brand)] bg-[var(--surface-soft)]" : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
                          }`}
                          onClick={() => handleDestinationTypeChange(item.value)}
                          type="button"
                        >
                          <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${item.tone}`}>
                            <Image alt="" className="h-8 w-8 object-contain" src={item.icon} />
                          </span>
                          <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                        </button>
                      );
                    })}
                  </div>

                  <>
                    {wizard.destType === "google_sheets" ? (
                      <>
                        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
                          Google ulanish tanlang, keyin mavjud spreadsheet ni tanlang yoki shu yerning o'zida yangisini yarating.
                        </div>
                        <div className="mt-3 space-y-3">
                          <div>
                            <UiDropdown
                              label="Google ulanish *"
                              value={wizard.destConnectionId}
                              placeholder="Google ulanishni tanlang"
                              options={googleConnections.map((connection) => ({ value: connection.id, label: connection.name }))}
                              onChange={(connectionId) => {
                              const conn = googleConnections.find((c) => c.id === connectionId) ?? null;
                              const spreadsheets = (((conn?.meta ?? {}) as { spreadsheets?: Array<{ id: string }> }).spreadsheets ?? []);
                              setWizard((p) => ({
                                ...p,
                                destConnectionId: connectionId,
                                destResourceId: p.googleSpreadsheetMode === "existing" ? (spreadsheets[0]?.id ?? "") : "",
                                destSheetName: p.googleSpreadsheetMode === "existing" ? "" : p.destSheetName,
                              }));
                              setGoogleSpreadsheetTabs([]);
                              setGoogleSheetHeaders([]);
                              setGoogleSheetMappings([]);
                              }}
                            />
                          </div>

                          <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-sm">
                            <button
                              className={`rounded-lg px-3 py-1.5 ${wizard.googleSpreadsheetMode === "existing" ? "bg-[var(--surface-soft)]" : "text-[var(--text-secondary)]"}`}
                              onClick={() => {
                                setWizard((p) => ({
                                  ...p,
                                  googleSpreadsheetMode: "existing",
                                  googleCreatedSpreadsheetUrl: "",
                                }));
                                setGoogleColumnRows([]);
                              }}
                              type="button"
                            >
                              Mavjudni tanlash
                            </button>
                            <button
                              className={`rounded-lg px-3 py-1.5 ${wizard.googleSpreadsheetMode === "create" ? "bg-[var(--surface-soft)]" : "text-[var(--text-secondary)]"}`}
                              onClick={() => {
                                setWizard((p) => ({
                                  ...p,
                                  googleSpreadsheetMode: "create",
                                  destResourceId: "",
                                  destSheetName: "",
                                  googleCreatedSpreadsheetUrl: "",
                                }));
                                setGoogleSheetMappings([]);
                              }}
                              type="button"
                            >
                              Yangi yaratish
                            </button>
                          </div>

                          {wizard.googleSpreadsheetMode === "existing" ? (
                            <>
                              <div>
                                <UiDropdown
                                  label="Spreadsheet *"
                                  value={wizard.destResourceId}
                                  placeholder="Spreadsheet tanlang"
                                  options={googleSpreadsheets.map((sheet) => ({ value: sheet.id, label: sheet.name }))}
                                  onChange={(nextValue) => {
                                    setWizard((p) => ({ ...p, destResourceId: nextValue, destSheetName: "", googleCreatedSpreadsheetUrl: "" }));
                                    setGoogleSpreadsheetTabs([]);
                                    setGoogleSheetHeaders([]);
                                    setGoogleSheetMappings([]);
                                  }}
                                />
                              </div>
                              {wizard.destResourceId ? (
                                <a
                                  className="inline-block text-xs text-[var(--brand)] underline"
                                  href={`https://docs.google.com/spreadsheets/d/${wizard.destResourceId}/edit`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Tanlangan sheetni ochish
                                </a>
                              ) : null}
                              <div>
                                <UiDropdown
                                  label="List (sheet) *"
                                  value={wizard.destSheetName}
                                  placeholder={googleSheetMetaLoading ? "Yuklanmoqda..." : "List tanlang"}
                                  options={googleSpreadsheetTabs.map((tab) => ({ value: tab, label: tab }))}
                                  disabled={!wizard.destResourceId || googleSheetMetaLoading}
                                  onChange={(nextValue) => {
                                    setWizard((p) => ({ ...p, destSheetName: nextValue }));
                                    setGoogleSheetMappings([]);
                                  }}
                                />
                              </div>

                              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-[var(--text-primary)]">Sheet field mapping</p>
                                  <button className="btn-primary" onClick={onAddGoogleSheetMappingRow} type="button">
                                    + Maydon qo'shish
                                  </button>
                                </div>

                                <p className="mb-2 text-xs text-[var(--text-secondary)]">
                                  Har qatorda Meta field dan Sheet ustuniga bog'lang. Agar ustun bo'lmasa + Yangi ustun yaratish ni tanlang.
                                </p>

                                {googleSheetMappings.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-secondary)]">
                                    Mapping yo'q. `Maydon qo'shish` ni bosing.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {googleSheetMappings.map((row) => (
                                      <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-2">
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                                          <UiDropdown
                                            label=""
                                            value={row.sourceField}
                                            placeholder="Meta lead field"
                                            options={googleSourceFieldOptions}
                                            onChange={(nextValue) => onUpdateGoogleSheetMappingRow(row.id, { sourceField: nextValue })}
                                          />
                                          <UiDropdown
                                            label=""
                                            value={row.selectedHeader}
                                            placeholder="Sheet ustuni tanlang"
                                            options={googleSheetTargetOptions}
                                            onChange={(nextValue) =>
                                              onUpdateGoogleSheetMappingRow(row.id, {
                                                selectedHeader: nextValue,
                                                customHeader: nextValue === "__new__" ? row.customHeader : "",
                                              })}
                                          />
                                          <button className="btn-ghost text-[var(--danger)] hover:bg-[var(--danger-soft)]" onClick={() => onRemoveGoogleSheetMappingRow(row.id)} type="button">
                                            O'chirish
                                          </button>
                                        </div>
                                        {row.selectedHeader === "__new__" ? (
                                          <input
                                            className="field mt-2"
                                            placeholder="Yangi ustun nomi"
                                            value={row.customHeader}
                                            onChange={(e) => onUpdateGoogleSheetMappingRow(row.id, { customHeader: e.target.value })}
                                          />
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="label">Spreadsheet nomi</label>
                              <input
                                className="field"
                                value={wizard.googleCreateSpreadsheetName}
                                onChange={(e) => setWizard((p) => ({ ...p, googleCreateSpreadsheetName: e.target.value }))}
                                placeholder="Bo'sh qoldirilsa: LeadFlow Leads YYYY-MM-DD"
                              />
                              <label className="label">List (sheet) nomi</label>
                              <input
                                className="field"
                                value={wizard.googleCreateSheetName}
                                onChange={(e) => setWizard((p) => ({ ...p, googleCreateSheetName: e.target.value }))}
                                placeholder="Bo'sh qoldirilsa: Leads"
                              />

                              <div>
                                <UiDropdown
                                  label="Column title rejimi"
                                  value={wizard.googleHeaderMode}
                                  placeholder="Rejim tanlang"
                                  options={[
                                    { value: "default", label: "Default (Meta fieldlardan)" },
                                    { value: "custom", label: "Custom (o'zim kiritaman)" },
                                    { value: "none", label: "Headersiz" },
                                  ]}
                                  onChange={(nextValue) => setWizard((p) => ({ ...p, googleHeaderMode: nextValue as "default" | "custom" | "none" }))}
                                />
                              </div>

                              {wizard.googleHeaderMode === "custom" ? (
                                <>
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="label mb-0">Column mapping</label>
                                    <button className="btn-primary" onClick={onAddGoogleColumnRow} type="button">
                                      + Column qo'shish
                                    </button>
                                  </div>
                                  {googleColumnRows.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                                      Hozircha mapping yo'q. `Column qo'shish` bilan boshlang.
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {googleColumnRows.map((row) => (
                                        <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                                          <UiDropdown
                                            label=""
                                            value={row.sourceField}
                                            placeholder="Meta lead field"
                                            options={googleSourceFieldOptions}
                                            onChange={(nextValue) => onUpdateGoogleColumnRow(row.id, { sourceField: nextValue })}
                                          />
                                          <input
                                            className="field"
                                            placeholder="Column title"
                                            value={row.columnTitle}
                                            onChange={(e) => onUpdateGoogleColumnRow(row.id, { columnTitle: e.target.value })}
                                          />
                                          <button className="btn-ghost text-[var(--danger)] hover:bg-[var(--danger-soft)]" onClick={() => onRemoveGoogleColumnRow(row.id)} type="button">
                                            O'chirish
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : null}

                              <div className="flex items-center gap-3">
                                <button
                                  className="btn-primary"
                                  disabled={creatingSheet}
                                  onClick={() => void onCreateGoogleSheetInPlace()}
                                  type="button"
                                >
                                  {creatingSheet ? (
                                    <span className="inline-flex items-center gap-2">
                                      <LoadingSpinner size="sm" className="border-[var(--border)] border-t-white" />
                                      Yaratilmoqda...
                                    </span>
                                  ) : "Sheet yaratish"}
                                </button>
                                {wizard.googleSpreadsheetMode === "create" && (wizard.googleCreatedSpreadsheetUrl || wizard.destResourceId) ? (
                                  <div className="text-xs text-[var(--success)]">
                                    <p>Yaratildi va tanlandi.</p>
                                    <a
                                      className="mt-1 inline-block text-[var(--brand)] underline"
                                      href={wizard.googleCreatedSpreadsheetUrl || `https://docs.google.com/spreadsheets/d/${wizard.destResourceId}/edit`}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      Sheetni ochish
                                    </a>
                                  </div>
                                ) : (
                                  <p className="text-xs text-[var(--text-secondary)]">Saqlashdan oldin sheet yarating.</p>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="label mt-3">
                          {wizard.destType === "bitrix24" ? "Bitrix24 Webhook URL" : "AmoCRM credentials JSON"} *
                        </label>
                        {wizard.destType === "bitrix24" ? (
                          <input
                            className="field h-11"
                            placeholder="https://...bitrix24.ru/rest/..."
                            value={wizard.destCredentials}
                            onChange={(e) => setWizard((p) => ({ ...p, destCredentials: e.target.value }))}
                          />
                        ) : (
                          <textarea
                            className="field min-h-20 resize-y"
                            placeholder='{"subdomain":"...","accessToken":"...","refreshToken":"..."}'
                            value={wizard.destCredentials}
                            onChange={(e) => setWizard((p) => ({ ...p, destCredentials: e.target.value }))}
                          />
                        )}
                      </>
                    )}
                    {wizard.destType === "bitrix24" ? (
                      <div className="mt-3 flex items-center gap-3">
                        <button className="btn-primary" disabled={fieldsLoading} onClick={() => void onLoadBitrixFields()} type="button">
                          {fieldsLoading ? (
                            <span className="inline-flex items-center gap-2">
                              <LoadingSpinner size="sm" className="border-[var(--border)] border-t-white" />
                              Yuklanmoqda...
                            </span>
                          ) : "Maydonlarni yuklash"}
                        </button>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {bitrixFields.length > 0 ? `${bitrixFields.length} ta Bitrix maydon yuklandi` : "Maydonlar hali yuklanmagan"}
                        </p>
                      </div>
                    ) : null}
                  </>
                </section>
              ) : null}

              {step === 4 ? (
                <section className="panel-soft p-4">
                  <p className="mb-3 text-lg font-semibold">4. Qo'shimcha sozlamalar</p>
                  {wizard.destType === "bitrix24" ? (
                    <>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm text-[var(--text-secondary)]">Manba maydonlarini Bitrix24 maydonlariga bog'lang.</p>
                        <button className="btn-primary" onClick={onAddMappingRow} type="button">
                          + Maydon qo'shish
                        </button>
                      </div>
                      {wizard.sourceType === "facebook" && !wizard.sourceFormId ? (
                        <div className="mb-3 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning)]">
                          Dynamic mapping uchun 1-bosqichda aniq form tanlang (Any form emas).
                        </div>
                      ) : null}
                      {sourceFieldsLoading ? (
                        <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                          <LoadingSpinner size="sm" />
                          <span>Manba forma maydonlari yuklanmoqda...</span>
                        </div>
                      ) : null}
                      {sourceFieldsError ? (
                        <div className="mb-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                          {sourceFieldsError}
                        </div>
                      ) : null}
                      {mappingRows.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                          Hozircha mapping qo'shilmagan. Kerak bo'lsa yuqoridan maydon qo'shing.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {mappingRows.map((row) => (
                            <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                              <UiDropdown
                                label=""
                                value={row.sourceField}
                                placeholder="Manba maydoni"
                                options={googleSourceFieldOptions}
                                onChange={(nextValue) => onUpdateMappingRow(row.id, { sourceField: nextValue })}
                              />
                              <UiDropdown
                                label=""
                                value={row.destinationField}
                                placeholder="Bitrix maydoni"
                                options={bitrixFields.map((field) => ({ value: field.code, label: `${field.title} (${field.code})` }))}
                                onChange={(nextValue) => onUpdateMappingRow(row.id, { destinationField: nextValue })}
                              />
                              <button className="btn-ghost text-[var(--danger)] hover:bg-[var(--danger-soft)]" onClick={() => onRemoveMappingRow(row.id)} type="button">
                                O'chirish
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">
                      Bu CRM uchun hozircha qo'lda mapping talab qilinmaydi. Default mapping ishlatiladi.
                    </p>
                  )}
                </section>
              ) : null}

              {error ? <p className="mt-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
              <button className="btn-ghost" onClick={() => setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev))} type="button">
                <ChevronLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Orqaga
              </button>

              <div className="flex items-center gap-2">
                {step < 4 ? (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (step === 1 && !canContinueStep1) {
                        setError(
                          wizard.sourceType === "facebook"
                            ? "Avval Facebook OAuth bilan profil ulang va sahifa tanlang."
                            : "Google ulanish va formani tanlang.",
                        );
                        return;
                      }
                      if (step === 2 && !canContinueStep2) {
                        setError("Integration nomini kiriting.");
                        return;
                      }
                      if (step === 3 && !canContinueStep3) {
                        setError(
                          wizard.destType === "google_sheets"
                            ? "Google sheet/list tanlang va mappingni to'liq qiling."
                            : "Destination credentials kiriting yoki qo'llab-quvvatlanadigan tizim tanlang.",
                        );
                        return;
                      }
                      if (step === 3 && wizard.destType === "bitrix24" && bitrixFields.length === 0) {
                        setError("Bitrix24 maydonlarini yuklang.");
                        return;
                      }
                      if (step === 3 && wizard.destType === "bitrix24" && !wizard.sourceFormId) {
                        setError("Mapping uchun aniq forma tanlang.");
                        return;
                      }
                      if (step === 3 && wizard.destType === "bitrix24" && sourceFieldsLoading) {
                        setError("Forma maydonlari yuklanmoqda, kuting.");
                        return;
                      }
                      if (step === 3 && wizard.destType === "bitrix24" && sourceFields.length === 0) {
                        setError(
                          wizard.sourceType === "google_forms"
                            ? "Google forma maydonlari yuklanmadi."
                            : "Facebook forma maydonlari yuklanmadi.",
                        );
                        return;
                      }
                      setError(null);
                      setStep((prev) => {
                        const next = prev < 4 ? ((prev + 1) as WizardStep) : prev;
                        if (prev === 3 && next === 4 && wizard.destType === "bitrix24" && mappingRows.length === 0) {
                          setMappingRows([emptyMappingRow()]);
                        }
                        return next;
                      });
                    }}
                    type="button"
                  >
                    <ChevronRight className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Keyingi
                  </button>
                ) : (
                  <button className="btn-primary" disabled={saving || !canSaveStep4} type="submit">
                    {saving ? (
                      <span className="inline-flex items-center gap-2">
                        <LoadingSpinner size="sm" className="border-[var(--border)] border-t-[var(--surface)]" />
                        Saqlanmoqda...
                      </span>
                    ) : (
                      <>
                        <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Saqlash
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      ) : null}
      <ConfirmDialog
        cancelText="Bekor qilish"
        confirmText={pendingToggle?.active ? "Tugatish" : "Faollashtirish"}
        loading={Boolean(deletingId && pendingToggle?.id === deletingId)}
        message={
          pendingToggle?.active
            ? "Integratsiyani tugatishni tasdiqlaysizmi?"
            : "Integratsiyani qayta faollashtirishni tasdiqlaysizmi?"
        }
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => void confirmToggleIntegration()}
        open={Boolean(pendingToggle)}
        title="Integratsiya holati"
      />
      {editingIntegration ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-lg font-semibold text-[var(--text-primary)]">Integratsiyani tahrirlash</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">ID: {editingIntegration.id}</p>
              </div>
              <button className="btn-ghost h-9 w-9 px-0" onClick={closeEditDialog} type="button" aria-label="Yopish">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Asosiy</p>
                <label className="block text-xs text-[var(--text-secondary)]">
                  Nomi
                  <input
                    className="field mt-1 h-10"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </label>
              </section>

              <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
                <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Dedup va bildirishnoma</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-[var(--text-secondary)]">Dedup holati</p>
                    <div className="inline-flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
                      <button
                        className={`flex-1 rounded-lg text-xs font-medium transition ${
                          editDedupEnabled ? "bg-[var(--brand)] text-white" : "text-[var(--text-secondary)]"
                        }`}
                        onClick={() => setEditDedupEnabled(true)}
                        type="button"
                      >
                        Yoqilgan
                      </button>
                      <button
                        className={`flex-1 rounded-lg text-xs font-medium transition ${
                          !editDedupEnabled ? "bg-[var(--text-primary)] text-[var(--surface)]" : "text-[var(--text-secondary)]"
                        }`}
                        onClick={() => setEditDedupEnabled(false)}
                        type="button"
                      >
                        O'chirilgan
                      </button>
                    </div>
                  </div>
                  <UiDropdown
                    label="Dedup maydoni"
                    value={editDedupField}
                    placeholder="Maydon tanlang"
                    options={[
                      { value: "phone", label: "Telefon" },
                      { value: "email", label: "Email" },
                    ]}
                    onChange={(next) => setEditDedupField(next as "phone" | "email")}
                    disabled={!editDedupEnabled}
                  />
                </div>

                <label className="mt-3 block text-xs text-[var(--text-secondary)]">
                  Telegram chat ID (ixtiyoriy)
                  <input
                    className="field mt-1 h-10"
                    placeholder="-100..."
                    value={editNotifyChatId}
                    onChange={(event) => setEditNotifyChatId(event.target.value)}
                  />
                </label>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Bu maydon to'ldirilsa, lead yetkazilganda Telegram bot shu chatga xabar yuboradi.
                  Bo'sh qoldirilsa, Telegram bildirishnoma yuborilmaydi.
                </p>
              </section>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button className="btn-ghost" disabled={editSaving} onClick={closeEditDialog} type="button">
                <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Bekor qilish
              </button>
              <button className="btn-primary" disabled={editSaving} onClick={() => void saveEditIntegration()} type="button">
                {editSaving ? "Saqlanmoqda..." : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Saqlash
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <div>
      <QueryBoundary>
        <IntegrationsContent />
      </QueryBoundary>
    </div>
  );
}


