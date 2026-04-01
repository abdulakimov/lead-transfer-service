export interface ApiError {
  error: string;
}

export interface Integration {
  id: string;
  name: string;
  active: boolean;
  source_type: string;
  source_page_id: string | null;
  source_form_id: string | null;
  dest_type: string;
  dest_credentials_set?: boolean;
  field_mapping?: Record<string, string>;
  notify_telegram_chat_id?: string | null;
  dedup_enabled: boolean;
  dedup_field: "phone" | "email";
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  leadgen_id: string;
  integration_id: string;
  source_type: "facebook" | "google_forms";
  status: "pending" | "processing" | "delivered" | "failed" | "dlq" | "duplicate";
  attempts: number;
  crm_lead_id: string | null;
  delivered_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  integration_name: string;
}

export interface LeadDetail extends Lead {
  raw_data: Record<string, unknown> | null;
  mapped_data: Record<string, unknown> | null;
}

export interface LeadsResponse {
  leads: Lead[];
  total: number;
  limit: number;
  offset: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  source_type: string;
  trigger_type: string;
  source_config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  is_published: boolean;
  definition: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_version_id: string;
  trigger_event_id: string | null;
  source_type: string;
  source_ref: string | null;
  status: "pending" | "running" | "completed" | "failed" | "canceled" | "dlq";
  attempts: number;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  workflow_name: string;
  workflow_version: number;
}

export interface WorkflowRunsResponse {
  runs: WorkflowRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkflowStep {
  id: string;
  run_id: string;
  step_key: string;
  step_type: string;
  step_order: number;
  attempt: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "canceled";
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_data: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunDetail {
  run: WorkflowRun & { context?: Record<string, unknown> };
  steps: WorkflowStep[];
}
