import type { NormalizedLead } from './facebook.js';

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return toText(value[0]);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      toText(obj.text)
      || toText(obj.value)
      || toText(obj.answer)
      || toText(obj.label)
      || toText(obj.title)
    );
  }
  return String(value).trim();
}

function normalizeAnswers(payload: Record<string, unknown>): Record<string, string> {
  const rawAnswers = (
    (typeof payload.answers === 'object' && payload.answers ? payload.answers : null)
    ?? (typeof payload.fields === 'object' && payload.fields ? payload.fields : null)
    ?? payload
  ) as Record<string, unknown>;

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawAnswers)) {
    if (!key || key === 'form_id' || key === 'response_id' || key === 'submitted_at') continue;
    if (!key || key === 'formId' || key === 'responseId' || key === 'submittedAt') continue;
    const text = toText(value);
    if (!text) continue;
    result[key] = text;
  }
  return result;
}

function firstMatch(
  fields: Record<string, string>,
  patterns: RegExp[],
): string {
  for (const [key, value] of Object.entries(fields)) {
    if (!value) continue;
    const normalizedKey = key.toLowerCase();
    if (patterns.some((pattern) => pattern.test(normalizedKey))) {
      return value;
    }
  }
  return '';
}

export function normalizeGoogleFormsLead(
  leadId: string,
  formId: string | null,
  payload: Record<string, unknown>,
): NormalizedLead {
  const rawFields = normalizeAnswers(payload);
  const createdAt = toText(payload.submitted_at) || toText(payload.submittedAt) || new Date().toISOString();

  const name = rawFields.full_name
    || rawFields.name
    || rawFields.ism
    || firstMatch(rawFields, [/full.?name/, /(^|_)name$/, /ism/]);

  const phone = rawFields.phone_number
    || rawFields.phone
    || rawFields.telefon
    || firstMatch(rawFields, [/phone/, /telefon/, /mobile/]);

  const email = rawFields.email
    || firstMatch(rawFields, [/email/, /e-?mail/]);

  return {
    id: leadId,
    name,
    phone,
    email,
    rawFields,
    adId: null,
    adName: 'Google Form',
    adSetId: null,
    adSetName: null,
    campaignId: null,
    campaignName: null,
    formId,
    pageId: formId,
    createdAt,
  };
}
