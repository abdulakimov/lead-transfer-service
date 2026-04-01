import { BitrixError, DuplicateLeadError } from './errors.js';
import type { NormalizedLead } from './facebook.js';

export interface BitrixLeadData {
  TITLE: string;
  NAME?: string;
  LAST_NAME?: string;
  PHONE?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  COMMENTS?: string;
  SOURCE_ID?: string;
  [key: string]: unknown;
}

export interface BitrixDeliveryResult {
  success: true;
  bitrixLeadId: number;
}

// ── Deliver lead to Bitrix24 ──

export async function deliverLead(webhookUrl: string, data: BitrixLeadData): Promise<BitrixDeliveryResult> {
  const url = normalizeWebhookUrl(webhookUrl) + 'crm.lead.add.json';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: data }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new BitrixError(`Bitrix24 xatosi (${response.status}): ${body}`, response.status);
  }

  const result = (await response.json()) as { result?: number; error?: string; error_description?: string };

  if (result.error) {
    throw new BitrixError(`Bitrix24: ${result.error} — ${result.error_description ?? ''}`);
  }

  if (!result.result) {
    throw new BitrixError('Bitrix24 kutilmagan javob: lead ID qaytarilmadi');
  }

  return { success: true, bitrixLeadId: result.result };
}

// ── Check for duplicate ──

export async function checkDuplicate(
  webhookUrl: string,
  field: 'phone' | 'email',
  value: string,
): Promise<boolean> {
  const url = normalizeWebhookUrl(webhookUrl) + 'crm.duplicate.findbycomm.json';

  const type = field === 'phone' ? 'PHONE' : 'EMAIL';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      values: [value],
      entity_type: 'LEAD',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new BitrixError(`Bitrix24 dedup xatosi (${response.status}): ${body}`, response.status);
  }

  const result = (await response.json()) as { result?: { LEAD?: number[] } };

  const leads = result.result?.LEAD ?? [];
  if (leads.length > 0) {
    throw new DuplicateLeadError(field, value);
  }

  return false;
}

// ── Helpers ──

function normalizeWebhookUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/';
}

// ── Field mapping ──

export function applyFieldMapping(
  lead: NormalizedLead,
  fields: Record<string, string>,
  mapping: Record<string, string>,
): BitrixLeadData {
  const sourcePrefix = lead.adName === 'Google Form' ? 'Google Form Lead' : 'Facebook Lead';
  const data: BitrixLeadData = {
    TITLE: `${sourcePrefix}: ${fields['name'] ?? fields['full_name'] ?? 'Nomsiz'}`,
  };

  for (const [sourceField, destField] of Object.entries(mapping)) {
    const value = fields[sourceField];
    if (!value) continue;

    const upper = destField.toUpperCase();

    if (upper === 'PHONE') {
      data.PHONE = [{ VALUE: value, VALUE_TYPE: 'WORK' }];
    } else if (upper === 'EMAIL') {
      data.EMAIL = [{ VALUE: value, VALUE_TYPE: 'WORK' }];
    } else {
      data[destField] = value;
    }
  }

  // Auto-map common fields if no explicit mapping
  if (!data.NAME && (fields['full_name'] || fields['name'])) {
    const fullName = fields['full_name'] ?? fields['name'] ?? '';
    const parts = fullName.split(' ');
    data.NAME = parts[0];
    if (parts.length > 1) data.LAST_NAME = parts.slice(1).join(' ');
  }

  if (!data.PHONE && (fields['phone_number'] || fields['phone'])) {
    data.PHONE = [{ VALUE: fields['phone_number'] ?? fields['phone'], VALUE_TYPE: 'WORK' }];
  }

  if (!data.EMAIL && fields['email']) {
    data.EMAIL = [{ VALUE: fields['email'], VALUE_TYPE: 'WORK' }];
  }

  return data;
}
