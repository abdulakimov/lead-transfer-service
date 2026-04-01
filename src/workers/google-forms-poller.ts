import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { decrypt } from '../config/encryption.js';
import { LEAD_STATUS } from '../config/constants.js';
import { addLeadJob } from '../queue/lead-queue.js';
import { loadEnv } from '../config/env.js';
import { formatErrorForLog } from '../utils/log-sanitize.js';

interface GoogleFormsResponseItem {
  responseId?: string;
  createTime?: string;
  lastSubmittedTime?: string;
  answers?: Record<string, unknown>;
}

interface GoogleFormsListResponse {
  responses?: GoogleFormsResponseItem[];
}

interface IntegrationRow {
  id: string;
  user_id: string;
  source_form_id: string | null;
  source_page_id: string | null; // stores source_connection_id for google_forms
}

interface QuestionMap {
  [questionId: string]: { key: string; label: string };
}

const DEFAULT_POLL_MS = 30_000;
const QUESTION_CACHE_TTL_MS = 5 * 60_000;
const questionCache = new Map<string, { at: number; map: QuestionMap }>();

function toSnake(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function getQuestionType(question?: {
  textQuestion?: unknown;
  choiceQuestion?: unknown;
  dateQuestion?: unknown;
  timeQuestion?: unknown;
  fileUploadQuestion?: unknown;
}): string {
  if (question?.choiceQuestion) return 'choice';
  if (question?.dateQuestion) return 'date';
  if (question?.timeQuestion) return 'time';
  if (question?.fileUploadQuestion) return 'file';
  return 'text';
}

function ensureUniqueKey(baseKey: string, used: Set<string>, questionId: string): string {
  if (!used.has(baseKey)) return baseKey;
  const withSuffix = `${baseKey}_${questionId.slice(-4).toLowerCase()}`;
  if (!used.has(withSuffix)) return withSuffix;
  let i = 2;
  while (used.has(`${withSuffix}_${i}`)) i += 1;
  return `${withSuffix}_${i}`;
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const item of values) {
    if (item && item.trim()) return item.trim();
  }
  return '';
}

function answerText(answer: unknown): string {
  if (!answer || typeof answer !== 'object') return '';
  const obj = answer as Record<string, unknown>;
  const textAnswers = obj.textAnswers as { answers?: Array<{ value?: string }> } | undefined;
  const choiceAnswers = obj.choiceAnswers as { answers?: Array<{ value?: string }> } | undefined;
  const fileAnswers = obj.fileUploadAnswers as { answers?: Array<{ fileId?: string }> } | undefined;
  const dateAnswers = obj.dateAnswers as { answers?: Array<{ year?: number; month?: number; day?: number }> } | undefined;
  const timeAnswers = obj.timeAnswers as { answers?: Array<{ hours?: number; minutes?: number; seconds?: number }> } | undefined;

  const text = textAnswers?.answers?.[0]?.value;
  if (text) return text;
  const choice = choiceAnswers?.answers?.[0]?.value;
  if (choice) return choice;
  const file = fileAnswers?.answers?.[0]?.fileId;
  if (file) return file;
  const date = dateAnswers?.answers?.[0];
  if (date && date.year && date.month && date.day) {
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  }
  const time = timeAnswers?.answers?.[0];
  if (time && Number.isFinite(time.hours) && Number.isFinite(time.minutes)) {
    return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
  }
  return '';
}

function enrichCommonFields(fields: Record<string, string>): Record<string, string> {
  const next = { ...fields };
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    if (!next.email && /email|e_mail|e-mail/.test(lower)) {
      next.email = value;
    }
    if (!next.phone_number && /phone|telefon|mobile/.test(lower)) {
      next.phone_number = value;
    }
    if (!next.full_name && /full_name|name|ism|fio/.test(lower)) {
      next.full_name = value;
    }
  }
  return next;
}

async function fetchGoogleAccessTokenByRefreshToken(refreshToken: string): Promise<string> {
  const env = loadEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google refresh token xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  const accessToken = (payload as { access_token?: string }).access_token;
  if (!accessToken) throw new Error('Google access token qaytmadi');
  return accessToken;
}

async function fetchFormQuestionMap(accessToken: string, formId: string): Promise<QuestionMap> {
  const cacheKey = formId;
  const cached = questionCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.at < QUESTION_CACHE_TTL_MS) {
    return cached.map;
  }

  const url = `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google form savollarini olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }

  const items = (payload as {
    items?: Array<{
      title?: string;
      questionItem?: {
        question?: {
          questionId?: string;
          title?: string;
          question?: {
            textQuestion?: unknown;
            choiceQuestion?: unknown;
            dateQuestion?: unknown;
            timeQuestion?: unknown;
            fileUploadQuestion?: unknown;
          };
        };
      };
      questionGroupItem?: {
        questions?: Array<{
          questionId?: string;
          title?: string;
          question?: {
            textQuestion?: unknown;
            choiceQuestion?: unknown;
            dateQuestion?: unknown;
            timeQuestion?: unknown;
            fileUploadQuestion?: unknown;
          };
        }>;
      };
    }>;
  }).items ?? [];
  const map: QuestionMap = {};
  const used = new Set<string>();
  for (const item of items) {
    const single = item.questionItem?.question;
    if (single?.questionId?.trim()) {
      const qid = single.questionId.trim();
      const label = firstNonEmpty(single.title, item.title, qid);
      const baseKey = toSnake(label) || qid;
      const key = ensureUniqueKey(baseKey, used, qid);
      used.add(key);
      map[qid] = { key, label };
    }

    for (const grouped of item.questionGroupItem?.questions ?? []) {
      const qid = grouped.questionId?.trim();
      if (!qid) continue;
      const label = firstNonEmpty(grouped.title, item.title, qid);
      const baseKey = toSnake(label) || qid;
      const key = ensureUniqueKey(baseKey, used, qid);
      used.add(key);
      map[qid] = { key, label: firstNonEmpty(label, key) };
    }
  }

  questionCache.set(cacheKey, { at: now, map });
  return map;
}

async function fetchFormResponses(accessToken: string, formId: string): Promise<GoogleFormsResponseItem[]> {
  const url = `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}/responses?pageSize=200`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google form javoblarini olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  return ((payload as GoogleFormsListResponse).responses ?? []).slice(-200);
}

function buildNormalizedPayload(
  formId: string,
  response: GoogleFormsResponseItem,
  questionMap: QuestionMap,
): Record<string, unknown> {
  const answers = response.answers ?? {};
  const fields: Record<string, string> = {};

  for (const [questionId, answer] of Object.entries(answers)) {
    const meta = questionMap[questionId];
    const value = answerText(answer);
    if (!value) continue;
    if (meta?.key) {
      fields[meta.key] = value;
    } else {
      fields[toSnake(questionId)] = value;
    }
  }

  return {
    form_id: formId,
    response_id: response.responseId ?? '',
    submitted_at: firstNonEmpty(response.lastSubmittedTime, response.createTime, new Date().toISOString()),
    answers: enrichCommonFields(fields),
  };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    const pool = getPool();
    const intResult = await pool.query(
      `SELECT id, user_id, source_form_id, source_page_id
       FROM integrations
       WHERE active = true
         AND source_type = 'google_forms'
         AND source_form_id IS NOT NULL`,
    );
    const integrations = intResult.rows as IntegrationRow[];
    for (const integration of integrations) {
      try {
        const formId = integration.source_form_id?.trim();
        const connectionId = integration.source_page_id?.trim();
        if (!formId || !connectionId) continue;

        const connResult = await pool.query(
          'SELECT credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
          [connectionId, integration.user_id, 'google'],
        );
        if (connResult.rows.length === 0) continue;

        const creds = JSON.parse(decrypt(String(connResult.rows[0].credentials))) as { refresh_token?: string };
        if (!creds.refresh_token) continue;

        const accessToken = await fetchGoogleAccessTokenByRefreshToken(creds.refresh_token);
        const questionMap = await fetchFormQuestionMap(accessToken, formId);
        const responses = await fetchFormResponses(accessToken, formId);

        for (const response of responses) {
          const responseId = response.responseId?.trim();
          const leadgenId = responseId
            ? `gform:${formId}:${responseId}`
            : `gform:${formId}:${createHash('sha1').update(JSON.stringify(response)).digest('hex').slice(0, 24)}`;

          const payload = buildNormalizedPayload(formId, response, questionMap);

          const insertResult = await pool.query(
            `INSERT INTO leads (integration_id, leadgen_id, fb_page_id, raw_data, status)
             VALUES ($1, $2, $3, $4::jsonb, $5)
             ON CONFLICT (leadgen_id) DO NOTHING`,
            [integration.id, leadgenId, formId, JSON.stringify(payload), LEAD_STATUS.PENDING],
          );
          if (insertResult.rowCount === 0) continue;

          await addLeadJob({
            leadgenId,
            integrationId: integration.id,
            pageId: formId,
            formId,
            sourceType: 'google_forms',
            sourcePayload: payload,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[google-forms:poller] integration=${integration.id} xato: ${formatErrorForLog(err)}`);
      }
    }
  } catch (err) {
    // Poller must never crash backend process on transient infra/config issues.
    // eslint-disable-next-line no-console
    console.error(`[google-forms:poller] cycle xato: ${formatErrorForLog(err)}`);
  } finally {
    running = false;
  }
}

export function startGoogleFormsPoller() {
  const intervalMs = Number(process.env.GOOGLE_FORMS_POLL_INTERVAL_MS ?? DEFAULT_POLL_MS);
  const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 10_000 ? intervalMs : DEFAULT_POLL_MS;

  timer = setInterval(() => {
    void pollOnce();
  }, safeInterval);

  void pollOnce();
  // eslint-disable-next-line no-console
  console.log(`[google-forms:poller] ishga tushdi interval=${safeInterval}ms`);

  return {
    async close() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
