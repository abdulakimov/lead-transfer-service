export const LEAD_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  DLQ: 'dlq',
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const CRM_TYPE = {
  BITRIX24: 'bitrix24',
  AMOCRM: 'amocrm',
} as const;

export type CrmType = (typeof CRM_TYPE)[keyof typeof CRM_TYPE];

export const RETRY_DELAYS = [
  30_000,       // 30s
  300_000,      // 5m
  1_800_000,    // 30m
  7_200_000,    // 2h
] as const;

export const MAX_ATTEMPTS = RETRY_DELAYS.length + 1;

export const FB_GRAPH_API_BASE = 'https://graph.facebook.com/v25.0';
