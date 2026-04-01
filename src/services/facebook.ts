import { FB_GRAPH_API_BASE } from '../config/constants.js';
import { FacebookAuthError, FacebookApiError } from './errors.js';

// ── Types ──

export interface FacebookRawLead {
  id: string;
  created_time: string;
  field_data: Array<{ name: string; values: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  page_id?: string;
}

export interface NormalizedLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  rawFields: Record<string, string>;
  adId: string | null;
  adName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  formId: string | null;
  pageId: string | null;
  createdAt: string;
}

// ── Fetch lead from Graph API ──

export async function fetchLead(leadgenId: string, pageAccessToken: string): Promise<NormalizedLead> {
  const fields = 'field_data,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id';
  const url = `${FB_GRAPH_API_BASE}/${leadgenId}?fields=${fields}&access_token=${pageAccessToken}`;

  const response = await fetch(url);

  if (!response.ok) {
    const rawBody = await response.text();
    let parsedBody: { error?: { code?: number; error_subcode?: number; message?: string } } = {};
    try {
      parsedBody = JSON.parse(rawBody) as typeof parsedBody;
    } catch {
      parsedBody = {};
    }
    const errorCode = parsedBody.error?.code;
    const errorSubcode = parsedBody.error?.error_subcode;

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      if (errorCode === 100 && errorSubcode === 33) {
        throw new FacebookApiError(
          `Facebook lead obyektiga kirish yo'q (${response.status}): ${rawBody}. Bu lead boshqa app/token kontekstida yaratilgan bo'lishi mumkin.`,
          response.status,
        );
      }
      throw new FacebookAuthError(
        `Facebook autentifikatsiya xatosi (${response.status}): ${rawBody}`,
        response.status,
      );
    }
    throw new FacebookApiError(
      `Facebook API xatosi (${response.status}): ${rawBody}`,
      response.status,
    );
  }

  const raw = (await response.json()) as FacebookRawLead;
  return normalizeLead(raw);
}

// ── Normalize raw lead data ──

export function normalizeLead(raw: FacebookRawLead): NormalizedLead {
  const rawFields = parseLeadFields(raw);
  if (raw.ad_id) rawFields['ad_id'] = raw.ad_id;
  if (raw.ad_name) rawFields['ad_name'] = raw.ad_name;
  if (raw.adset_id) rawFields['adset_id'] = raw.adset_id;
  if (raw.adset_name) rawFields['adset_name'] = raw.adset_name;
  if (raw.campaign_id) rawFields['campaign_id'] = raw.campaign_id;
  if (raw.campaign_name) rawFields['campaign_name'] = raw.campaign_name;
  if (raw.form_id) rawFields['form_id'] = raw.form_id;
  if (raw.page_id) rawFields['page_id'] = raw.page_id;

  return {
    id: raw.id,
    name: rawFields['full_name'] ?? rawFields['name'] ?? '',
    phone: rawFields['phone_number'] ?? rawFields['phone'] ?? '',
    email: rawFields['email'] ?? '',
    rawFields,
    adId: raw.ad_id ?? null,
    adName: raw.ad_name ?? null,
    adSetId: raw.adset_id ?? null,
    adSetName: raw.adset_name ?? null,
    campaignId: raw.campaign_id ?? null,
    campaignName: raw.campaign_name ?? null,
    formId: raw.form_id ?? null,
    pageId: raw.page_id ?? null,
    createdAt: raw.created_time,
  };
}

export function parseLeadFields(data: Pick<FacebookRawLead, 'field_data'>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const field of data.field_data ?? []) {
    fields[field.name] = field.values[0] ?? '';
  }
  return fields;
}
