import type {
  Integration,
  LeadDetail,
  LeadsResponse,
  Workflow,
  WorkflowRunDetail,
  WorkflowRunsResponse,
  WorkflowVersion,
} from "@/lib/types";
import { clearSession } from "@/lib/session";

function resolveApiBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    if (isLocalHost) {
      return "http://localhost:3000";
    }
  }

  // Production default: use same-origin reverse-proxy (/api -> backend)
  return "";
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function getAuthHeaders(token?: string): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    const apiBaseUrl = resolveApiBaseUrl();
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError("Server bilan aloqa qilib bo'lmadi. Tarmoq yoki API manzilini tekshiring.", 0);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    const message = payload.error || `HTTP ${response.status}`;
    const error = new ApiRequestError(message, response.status);

    if (response.status === 401 && typeof window !== "undefined") {
      clearSession();
      window.location.replace("/login");
    }

    throw error;
  }

  return response.json() as Promise<T>;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url?: string;
  };
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface AuthGoogleInitResponse {
  auth_url: string;
  state: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  source_type: string;
  trigger_type: string;
  source_config?: Record<string, unknown>;
}

export interface CreateIntegrationInput {
  name: string;
  source_type: "facebook" | "google_forms";
  source_connection_id?: string;
  source_page_id?: string;
  source_page_access_token?: string;
  source_form_id?: string | null;
  dest_type: "bitrix24" | "amocrm" | "google_sheets";
  dest_connection_id?: string;
  dest_resource_id?: string;
  dest_sheet_name?: string;
  dest_columns?: Array<{ source_field: string; column_title: string }>;
  dest_credentials?: string;
  field_mapping?: Record<string, string>;
  notify_telegram_chat_id?: string | null;
  dedup_enabled?: boolean;
  dedup_field?: "phone" | "email";
}

export interface FacebookConnectedForm {
  id: string;
  name: string;
  status?: string;
}

export interface FacebookConnectedPage {
  id: string;
  name: string;
  access_token: string;
  forms: FacebookConnectedForm[];
}

export interface FacebookFormFetchError {
  page_id: string;
  page_name?: string;
  error: string;
}

export interface FacebookConnectedPixel {
  id: string;
  name: string;
  ad_account_id?: string;
  ad_account_name?: string;
}

export interface FacebookSourceField {
  key: string;
  label: string;
  type: string;
}

export interface FacebookOAuthInitResponse {
  auth_url: string;
  state: string;
}

export interface GoogleSpreadsheetOption {
  id: string;
  name: string;
}
export interface GoogleFormOption {
  id: string;
  name: string;
}

export interface CreateGoogleSpreadsheetInput {
  connection_id: string;
  spreadsheet_name?: string;
  sheet_name?: string;
  header_mode?: "default" | "custom" | "none";
  custom_headers?: string[];
  column_mappings?: Array<{ source_field: string; column_title: string }>;
  source_fields?: Array<{ key: string; label: string }>;
}

export interface CreateGoogleSpreadsheetResponse {
  spreadsheet: {
    id: string;
    name: string;
    sheet_name: string;
    url: string;
  };
}

export interface GoogleSpreadsheetMetaResponse {
  spreadsheet_id: string;
  selected_sheet_name: string;
  sheets: Array<{ name: string }>;
  headers: string[];
}

export interface GoogleFormsListResponse {
  forms: GoogleFormOption[];
  total: number;
}

export interface SyncGoogleSpreadsheetColumnsInput {
  connection_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  columns: string[];
}

export interface SyncGoogleSpreadsheetColumnsResponse {
  sheet_name: string;
  headers: string[];
  added: string[];
}

export interface ConnectionSummary {
  id: string;
  provider: "facebook" | "google";
  external_id: string;
  name: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConnectionDetail extends ConnectionSummary {
  credentials: Record<string, unknown>;
}

export interface GoogleOAuthInitResponse {
  auth_url: string;
  state: string;
}

export type GoogleOAuthResultResponse =
  | { status: "pending" }
  | {
    status: "done";
    success: true;
    payload: {
      profile: { id: string; email: string; name?: string };
      refresh_token: string;
      spreadsheets: GoogleSpreadsheetOption[];
    };
  }
  | {
    status: "done";
    success: false;
    error: string;
  };

export type FacebookOAuthResultResponse =
  | { status: "pending" }
  | {
    status: "done";
    success: true;
    payload: {
      profile: { id: string; name: string; user_id: string };
      pages: FacebookConnectedPage[];
      pixels: FacebookConnectedPixel[];
      user_access_token: string;
      short_lived_user_access_token?: string;
      granted_permissions?: string[];
      form_fetch_errors?: FacebookFormFetchError[];
    };
  }
  | {
    status: "done";
    success: false;
    error: string;
  };

export interface BitrixLeadField {
  code: string;
  title: string;
  type: string;
  required: boolean;
  multiple: boolean;
}

export interface CreateWorkflowVersionInput {
  definition: Record<string, unknown>;
}

export interface PublishWorkflowInput {
  version_id?: string;
  version?: number;
}

export interface DispatchWorkflowInput {
  trigger_event_id: string;
  source_ref: string;
  context?: Record<string, unknown>;
}

export interface DispatchWorkflowResponse {
  message: string;
  run: {
    id: string;
    status?: string;
    steps_executed?: number;
    workflow_version?: number;
  };
}

export interface MetaPixelConfig {
  id: string;
  name: string;
  active: boolean;
  pixel_id: string;
  auto_page_view: boolean;
  created_at: string;
  updated_at: string;
}

export interface MetaPixelEvent {
  id: string;
  event_name: string;
  event_id: string;
  event_time: string;
  action_source: string;
  event_source_url?: string | null;
  fbq_sent: boolean;
  blocked_reason?: string | null;
  created_at: string;
  pixel_id: string;
  config_name: string;
}

export interface MetaPixelDiagnostics {
  summary: {
    pixel_events: number;
    capi_events: number;
    missing_in_capi: number;
    missing_in_pixel: number;
    event_name_mismatch: number;
    timestamp_drift: number;
  };
  samples: {
    missing_in_capi: Array<Record<string, unknown>>;
    missing_in_pixel: Array<Record<string, unknown>>;
    event_name_mismatch: Array<Record<string, unknown>>;
    timestamp_drift: Array<Record<string, unknown>>;
  };
}

export interface MetaCapiEventQueueResponse {
  queued?: boolean;
  duplicate?: boolean;
  event: {
    id: string;
    event_id: string;
    event_name: string;
    event_time: string;
    status?: string;
    created_at: string;
  };
}

export interface MetaCapiConfig {
  id: string;
  name: string;
  active: boolean;
  pixel_id: string;
  created_at: string;
  updated_at: string;
  has_access_token?: boolean;
  has_test_event_code?: boolean;
}

export interface MetaCapiEvent {
  id: string;
  event_name: string;
  event_id: string;
  event_time: string;
  source: string;
  status: "pending" | "processing" | "delivered" | "failed" | "dlq" | "duplicate";
  attempts: number;
  last_error?: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
  pixel_id: string;
  config_name: string;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(input: RegisterInput): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAuthGoogleInit(origin?: string): Promise<AuthGoogleInitResponse> {
  const query = origin ? `?origin=${encodeURIComponent(origin)}` : "";
  return request<AuthGoogleInitResponse>(`/api/auth/google/init${query}`);
}

export function getIntegrations(token: string): Promise<Integration[]> {
  return request<Integration[]>("/api/integrations", {}, token);
}

export function getConnections(token: string): Promise<ConnectionSummary[]> {
  return request<ConnectionSummary[]>("/api/connections", {}, token);
}

export function getConnectionById(connectionId: string, token: string): Promise<ConnectionDetail> {
  return request<ConnectionDetail>(`/api/connections/${connectionId}`, {}, token);
}

export function upsertConnection(
  input: {
    provider: "facebook" | "google";
    external_id: string;
    name: string;
    credentials: Record<string, unknown>;
    meta?: Record<string, unknown>;
  },
  token: string,
): Promise<ConnectionSummary> {
  return request<ConnectionSummary>(
    "/api/connections",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function deleteConnection(connectionId: string, token: string): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/api/connections/${connectionId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export function createIntegration(input: CreateIntegrationInput, token: string): Promise<Integration> {
  return request<Integration>(
    "/api/integrations",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getIntegrationById(integrationId: string, token: string): Promise<Integration> {
  return request<Integration>(`/api/integrations/${encodeURIComponent(integrationId)}`, {}, token);
}

export function updateIntegration(
  integrationId: string,
  input: Partial<CreateIntegrationInput> & {
    name?: string;
    dedup_enabled?: boolean;
    dedup_field?: "phone" | "email";
    notify_telegram_chat_id?: string | null;
  },
  token: string,
): Promise<Integration> {
  return request<Integration>(
    `/api/integrations/${integrationId}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function deleteIntegration(integrationId: string, token: string): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/api/integrations/${integrationId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export function toggleIntegration(integrationId: string, token: string): Promise<Integration> {
  return request<Integration>(
    `/api/integrations/${integrationId}/toggle`,
    {
      method: "POST",
    },
    token,
  );
}

export function getFacebookOAuthInit(token: string): Promise<FacebookOAuthInitResponse> {
  return request<FacebookOAuthInitResponse>("/api/integrations/facebook/oauth/init", {}, token);
}

export function getFacebookOAuthResult(state: string, token: string): Promise<FacebookOAuthResultResponse> {
  return request<FacebookOAuthResultResponse>(`/api/integrations/facebook/oauth/result?state=${encodeURIComponent(state)}`, {}, token);
}

export function refreshFacebookConnectionForms(
  connectionId: string,
  token: string,
): Promise<{
  pages: Array<{ id: string; name: string; forms: FacebookConnectedForm[] }>;
  total_pages: number;
  total_forms: number;
  errors: FacebookFormFetchError[];
}> {
  return request(
    "/api/integrations/facebook/forms/refresh",
    {
      method: "POST",
      body: JSON.stringify({ connection_id: connectionId }),
    },
    token,
  );
}

export function getGoogleOAuthInit(token: string): Promise<GoogleOAuthInitResponse> {
  return request<GoogleOAuthInitResponse>("/api/integrations/google/oauth/init", {}, token);
}

export function getGoogleOAuthResult(state: string, token: string): Promise<GoogleOAuthResultResponse> {
  return request<GoogleOAuthResultResponse>(`/api/integrations/google/oauth/result?state=${encodeURIComponent(state)}`, {}, token);
}

export function getGoogleForms(connectionId: string, token: string): Promise<GoogleFormsListResponse> {
  return request<GoogleFormsListResponse>(
    `/api/integrations/google/forms?connection_id=${encodeURIComponent(connectionId)}`,
    {},
    token,
  );
}

export function getGoogleFormFields(
  connectionId: string,
  formId: string,
  token: string,
): Promise<{ fields: FacebookSourceField[]; total: number }> {
  return request<{ fields: FacebookSourceField[]; total: number }>(
    `/api/integrations/google/form-fields?connection_id=${encodeURIComponent(connectionId)}&form_id=${encodeURIComponent(formId)}`,
    {},
    token,
  );
}

export function createGoogleSpreadsheet(
  input: CreateGoogleSpreadsheetInput,
  token: string,
): Promise<CreateGoogleSpreadsheetResponse> {
  return request<CreateGoogleSpreadsheetResponse>(
    "/api/integrations/google/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getGoogleSpreadsheetMeta(
  input: { connection_id: string; spreadsheet_id: string; sheet_name?: string },
  token: string,
): Promise<GoogleSpreadsheetMetaResponse> {
  return request<GoogleSpreadsheetMetaResponse>(
    "/api/integrations/google/spreadsheets/meta",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function syncGoogleSpreadsheetColumns(
  input: SyncGoogleSpreadsheetColumnsInput,
  token: string,
): Promise<SyncGoogleSpreadsheetColumnsResponse> {
  return request<SyncGoogleSpreadsheetColumnsResponse>(
    "/api/integrations/google/spreadsheets/sync-columns",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getFacebookFormFields(
  formId: string,
  params: { pageAccessToken?: string; connectionId?: string; pageId?: string },
  token: string,
): Promise<{ fields: FacebookSourceField[]; total: number }> {
  return request<{ fields: FacebookSourceField[]; total: number }>(
    "/api/integrations/facebook/form-fields",
    {
      method: "POST",
      body: JSON.stringify({
        form_id: formId,
        page_access_token: params.pageAccessToken,
        connection_id: params.connectionId,
        page_id: params.pageId,
      }),
    },
    token,
  );
}

export function getBitrixLeadFields(webhookUrl: string, token: string): Promise<{ fields: BitrixLeadField[]; total: number }> {
  return request<{ fields: BitrixLeadField[]; total: number }>(
    "/api/integrations/bitrix/fields",
    {
      method: "POST",
      body: JSON.stringify({ webhook_url: webhookUrl }),
    },
    token,
  );
}

export function getBitrixLeadFieldsByIntegration(
  integrationId: string,
  token: string,
): Promise<{ fields: BitrixLeadField[]; total: number }> {
  return request<{ fields: BitrixLeadField[]; total: number }>(
    `/api/integrations/${encodeURIComponent(integrationId)}/bitrix/fields`,
    {},
    token,
  );
}

export function getBitrixLeadFieldsByIntegrationQuery(
  integrationId: string,
  token: string,
): Promise<{ fields: BitrixLeadField[]; total: number }> {
  return request<{ fields: BitrixLeadField[]; total: number }>(
    `/api/integrations/bitrix/fields/by-integration?integration_id=${encodeURIComponent(integrationId)}`,
    {},
    token,
  );
}

export function getLeads(
  token: string,
  params?: { limit?: number; offset?: number; status?: string; integration_id?: string },
): Promise<LeadsResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(params?.limit ?? 50));
  query.set("offset", String(params?.offset ?? 0));
  if (params?.status) query.set("status", params.status);
  if (params?.integration_id) query.set("integration_id", params.integration_id);
  return request<LeadsResponse>(`/api/leads?${query.toString()}`, {}, token);
}

export function getLeadById(leadId: string, token: string): Promise<LeadDetail> {
  return request<LeadDetail>(`/api/leads/${encodeURIComponent(leadId)}`, {}, token);
}

export function retryLead(leadId: string, token: string): Promise<{ message: string; leadId: string }> {
  return request<{ message: string; leadId: string }>(
    `/api/leads/${encodeURIComponent(leadId)}/retry`,
    { method: "POST" },
    token,
  );
}

export interface LeadsStatsSummaryRow {
  integration_id: string;
  integration_name: string;
  delivered: number;
  failed: number;
  dlq: number;
  duplicate: number;
  total: number;
}

export function getLeadsStatsSummary(token: string): Promise<LeadsStatsSummaryRow[]> {
  return request<LeadsStatsSummaryRow[]>("/api/leads/stats/summary", {}, token);
}

export function getWorkflows(token: string): Promise<Workflow[]> {
  return request<Workflow[]>("/api/workflows", {}, token);
}

export function createWorkflow(input: CreateWorkflowInput, token: string): Promise<Workflow> {
  return request<Workflow>(
    "/api/workflows",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function createWorkflowVersion(
  workflowId: string,
  input: CreateWorkflowVersionInput,
  token: string,
): Promise<WorkflowVersion> {
  return request<WorkflowVersion>(
    `/api/workflows/${workflowId}/versions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function publishWorkflow(
  workflowId: string,
  input: PublishWorkflowInput,
  token: string,
): Promise<{ message: string; workflow_id: string; version_id: string; version: number }> {
  return request(
    `/api/workflows/${workflowId}/publish`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function dispatchWorkflow(
  workflowId: string,
  input: DispatchWorkflowInput,
  token: string,
): Promise<DispatchWorkflowResponse> {
  return request<DispatchWorkflowResponse>(
    `/api/workflows/${workflowId}/dispatch`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getWorkflowRuns(token: string): Promise<WorkflowRunsResponse> {
  return request<WorkflowRunsResponse>("/api/workflows/runs?limit=50&offset=0", {}, token);
}

export function getWorkflowRunDetail(runId: string, token: string): Promise<WorkflowRunDetail> {
  return request<WorkflowRunDetail>(`/api/workflows/runs/${runId}`, {}, token);
}

export function getMetaPixelConfigs(token: string): Promise<{ configs: MetaPixelConfig[] }> {
  return request<{ configs: MetaPixelConfig[] }>("/api/meta-pixel/config", {}, token);
}

export function upsertMetaPixelConfig(
  input: { name: string; pixel_id: string; active: boolean; auto_page_view: boolean },
  token: string,
): Promise<{ config: MetaPixelConfig }> {
  return request<{ config: MetaPixelConfig }>(
    "/api/meta-pixel/config",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function trackMetaPixelBrowserEvent(
  input: {
    config_id?: string;
    integration_id?: string;
    source?: string;
    event_name: string;
    event_id: string;
    event_time?: string;
    action_source?: "website" | "app" | "phone_call" | "chat" | "physical_store" | "system_generated" | "business_messaging" | "other";
    event_source_url?: string;
    user_data?: Record<string, unknown>;
    custom_data?: Record<string, unknown>;
    browser_meta?: Record<string, unknown>;
    fbq_sent?: boolean;
    blocked_reason?: string;
  },
  token: string,
): Promise<{ event: MetaPixelEvent }> {
  return request<{ event: MetaPixelEvent }>(
    "/api/meta-pixel/events",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getMetaPixelEvents(
  token: string,
  params?: { limit?: number; offset?: number },
): Promise<{ events: MetaPixelEvent[]; total: number; limit: number; offset: number }> {
  const query = new URLSearchParams();
  query.set("limit", String(params?.limit ?? 50));
  query.set("offset", String(params?.offset ?? 0));
  return request<{ events: MetaPixelEvent[]; total: number; limit: number; offset: number }>(
    `/api/meta-pixel/events?${query.toString()}`,
    {},
    token,
  );
}

export function getMetaPixelDiagnostics(token: string): Promise<MetaPixelDiagnostics> {
  return request<MetaPixelDiagnostics>("/api/meta-pixel/diagnostics", {}, token);
}

export function enqueueMetaCapiEvent(
  input: {
    config_id?: string;
    integration_id?: string;
    source?: string;
    event_name: string;
    event_id?: string;
    event_time?: string;
    action_source?: "website" | "app" | "phone_call" | "chat" | "physical_store" | "system_generated" | "business_messaging" | "other";
    event_source_url?: string;
    user_data?: Record<string, unknown>;
    custom_data?: Record<string, unknown>;
  },
  token: string,
): Promise<MetaCapiEventQueueResponse> {
  return request<MetaCapiEventQueueResponse>(
    "/api/meta-capi/events",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getMetaCapiConfigs(token: string): Promise<{ configs: MetaCapiConfig[] }> {
  return request<{ configs: MetaCapiConfig[] }>("/api/meta-capi/config", {}, token);
}

export function upsertMetaCapiConfig(
  input: {
    name: string;
    pixel_id: string;
    access_token: string;
    test_event_code?: string | null;
    active: boolean;
  },
  token: string,
): Promise<{ config: MetaCapiConfig }> {
  return request<{ config: MetaCapiConfig }>(
    "/api/meta-capi/config",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getMetaCapiEvents(
  token: string,
  params?: { status?: string; limit?: number; offset?: number },
): Promise<{ events: MetaCapiEvent[]; total: number; limit: number; offset: number }> {
  const query = new URLSearchParams();
  query.set("limit", String(params?.limit ?? 20));
  query.set("offset", String(params?.offset ?? 0));
  if (params?.status) query.set("status", params.status);
  return request<{ events: MetaCapiEvent[]; total: number; limit: number; offset: number }>(
    `/api/meta-capi/events?${query.toString()}`,
    {},
    token,
  );
}

export function retryMetaCapiEvent(eventId: string, token: string): Promise<{ message: string; event_id: string }> {
  return request<{ message: string; event_id: string }>(
    `/api/meta-capi/events/${encodeURIComponent(eventId)}/retry`,
    { method: "POST" },
    token,
  );
}
