import { createHash, randomUUID } from 'node:crypto';
import { FB_GRAPH_API_BASE } from '../config/constants.js';
import { MetaCapiError } from './errors.js';

export type MetaActionSource =
  | 'website'
  | 'app'
  | 'phone_call'
  | 'chat'
  | 'physical_store'
  | 'system_generated'
  | 'business_messaging'
  | 'other';

export interface MetaEventInput {
  eventName: string;
  eventTime: Date;
  eventId: string;
  actionSource: MetaActionSource;
  eventSourceUrl?: string | null;
  userData: Record<string, unknown>;
  customData: Record<string, unknown>;
}

const HASHED_USER_DATA_KEYS = new Set([
  'em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id', 'ge', 'db',
]);

const PASSTHROUGH_USER_DATA_KEYS = new Set([
  'client_ip_address', 'client_user_agent', 'fbc', 'fbp', 'subscription_id', 'lead_id', 'madid',
]);

function normalizeValueForHash(key: string, value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (key === 'ph') {
    return trimmed.replace(/\D/g, '');
  }
  return trimmed;
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function toSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeUserDataValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    if (PASSTHROUGH_USER_DATA_KEYS.has(key)) {
      return value.trim();
    }
    if (!HASHED_USER_DATA_KEYS.has(key)) {
      return value.trim();
    }
    const normalized = normalizeValueForHash(key, value);
    if (!normalized) return '';
    if (isSha256Hex(normalized)) return normalized.toLowerCase();
    return toSha256(normalized);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeUserDataValue(key, item))
      .filter((item) => item !== '' && item !== null && item !== undefined);
  }

  return value;
}

export function buildMetaUserData(userData: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(userData)) {
    if (value === null || value === undefined) continue;
    const normalized = sanitizeUserDataValue(key, value);
    if (normalized === '' || normalized === null) continue;
    if (Array.isArray(normalized) && normalized.length === 0) continue;
    result[key] = normalized;
  }
  return result;
}

export function createStableMetaEventId(input: {
  userId: string;
  eventName: string;
  eventTime: Date;
  actionSource: string;
  externalRef?: string | null;
}): string {
  const externalRef = input.externalRef?.trim() || randomUUID();
  const material = [
    input.userId,
    input.eventName.trim().toLowerCase(),
    input.eventTime.toISOString(),
    input.actionSource.trim().toLowerCase(),
    externalRef,
  ].join('|');

  return `capi_${toSha256(material).slice(0, 32)}`;
}

export async function sendMetaConversionEvent(input: {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
  event: MetaEventInput;
}): Promise<Record<string, unknown>> {
  const payload = {
    data: [
      {
        event_name: input.event.eventName,
        event_time: Math.floor(input.event.eventTime.getTime() / 1000),
        event_id: input.event.eventId,
        action_source: input.event.actionSource,
        event_source_url: input.event.eventSourceUrl ?? undefined,
        user_data: buildMetaUserData(input.event.userData),
        custom_data: input.event.customData,
      },
    ],
    test_event_code: input.testEventCode || undefined,
  };

  const response = await fetch(`${FB_GRAPH_API_BASE}/${encodeURIComponent(input.pixelId)}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      access_token: input.accessToken,
    }),
  });

  const rawText = await response.text();
  let parsedBody: Record<string, unknown> = {};
  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      parsedBody = { raw: rawText };
    }
  }

  if (!response.ok) {
    const metaError = (typeof parsedBody.error === 'object' && parsedBody.error
      ? parsedBody.error
      : null) as
      | {
        message?: string;
        type?: string;
        code?: number | string;
        error_subcode?: number | string;
        fbtrace_id?: string;
      }
      | null;

    const graphCode = Number(metaError?.code);
    const graphSubcode = Number(metaError?.error_subcode);
    const graphMessage = (metaError?.message ?? '').toLowerCase();

    const isPixelAccessOrExistenceError = response.status === 400 && (
      (graphCode === 100 && graphSubcode === 33)
      || graphMessage.includes('unsupported post request')
      || graphMessage.includes('object with id')
      || graphMessage.includes('missing permissions')
    );

    if (isPixelAccessOrExistenceError) {
      const trace = metaError?.fbtrace_id ? ` fbtrace_id=${metaError.fbtrace_id}` : '';
      throw new MetaCapiError(
        `Meta CAPI konfiguratsiya xatosi: pixel_id topilmadi yoki access token ruxsatlari yetarli emas.${trace}`,
        response.status,
      );
    }

    const message = typeof parsedBody.error === 'object' && parsedBody.error
      ? JSON.stringify(parsedBody.error)
      : rawText || `HTTP ${response.status}`;
    throw new MetaCapiError(`Meta CAPI xatosi (${response.status}): ${message}`, response.status);
  }

  return parsedBody;
}
