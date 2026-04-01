import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import { getPool } from '../db/pool.js';
import { encrypt, decrypt } from '../config/encryption.js';
import { getEnv } from '../config/env.js';
import { FB_GRAPH_API_BASE } from '../config/constants.js';
import { AppError } from '../middleware/error-handler.js';
import { getCrmAdapter } from '../services/crm-adapter.js';
import { runIntegrationPreflight } from '../services/integration-preflight.js';
import type { NormalizedLead } from '../services/facebook.js';

const router = Router();

interface FacebookOAuthState {
  userId: string;
  origin?: string;
}

interface GoogleOAuthState {
  userId: string;
  origin?: string;
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
}

interface FacebookLeadForm {
  id: string;
  name: string;
  status?: string;
}

interface FacebookFormsFetchError {
  page_id: string;
  page_name?: string;
  error: string;
}

interface FacebookPixel {
  id: string;
  name: string;
  ad_account_id?: string;
  ad_account_name?: string;
}

interface FacebookFormQuestion {
  key?: string;
  label?: string;
  type?: string;
}

interface GoogleOAuthTokenPayload {
  access_token: string;
  refresh_token?: string;
}

interface GoogleSpreadsheet {
  id: string;
  name: string;
}
interface GoogleFormFile {
  id: string;
  name: string;
}
interface GoogleFormQuestionField {
  key: string;
  label: string;
  type: string;
}

interface GoogleSpreadsheetCreateResult {
  spreadsheetId: string;
  spreadsheetUrl?: string;
}
interface GoogleSpreadsheetSheet {
  name: string;
}

interface BitrixLeadFieldMeta {
  title?: string;
  type?: string;
  isRequired?: boolean | 'Y' | 'N';
  isMultiple?: boolean | 'Y' | 'N';
}

type FacebookOAuthResult =
  | {
    success: true;
    payload: {
      profile: { id: string; name: string; user_id: string };
      pages: Array<FacebookPage & { forms: FacebookLeadForm[] }>;
      pixels: FacebookPixel[];
      user_access_token: string;
      form_fetch_errors?: FacebookFormsFetchError[];
    };
  }
  | {
    success: false;
    error: string;
  };

interface FacebookOAuthStoreEntry {
  userId: string;
  createdAt: number;
  status: 'pending' | 'done';
  result?: FacebookOAuthResult;
}

type GoogleOAuthResult =
  | {
    success: true;
    payload: {
      profile: { id: string; email: string; name?: string };
      refresh_token: string;
      spreadsheets: GoogleSpreadsheet[];
    };
  }
  | {
    success: false;
    error: string;
  };

interface GoogleOAuthStoreEntry {
  userId: string;
  createdAt: number;
  status: 'pending' | 'done';
  result?: GoogleOAuthResult;
}

const facebookStateSchema = z.object({
  userId: z.string().uuid(),
  origin: z.string().optional(),
});

const googleStateSchema = z.object({
  userId: z.string().uuid(),
  origin: z.string().optional(),
});

const FACEBOOK_OAUTH_ENTRY_TTL_MS = 10 * 60 * 1000;
const facebookOAuthStore = new Map<string, FacebookOAuthStoreEntry>();
const GOOGLE_OAUTH_ENTRY_TTL_MS = 10 * 60 * 1000;
const googleOAuthStore = new Map<string, GoogleOAuthStoreEntry>();

function cleanupFacebookOAuthStore() {
  const now = Date.now();
  for (const [key, value] of facebookOAuthStore.entries()) {
    if (now - value.createdAt > FACEBOOK_OAUTH_ENTRY_TTL_MS) {
      facebookOAuthStore.delete(key);
    }
  }
}

function cleanupGoogleOAuthStore() {
  const now = Date.now();
  for (const [key, value] of googleOAuthStore.entries()) {
    if (now - value.createdAt > GOOGLE_OAUTH_ENTRY_TTL_MS) {
      googleOAuthStore.delete(key);
    }
  }
}

function signFacebookOAuthState(payload: FacebookOAuthState): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: 600 });
}

function signGoogleOAuthState(payload: GoogleOAuthState): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: 600 });
}

function verifyFacebookOAuthState(token: string): FacebookOAuthState {
  const env = getEnv();
  const parsed = jwt.verify(token, env.JWT_SECRET);
  return facebookStateSchema.parse(parsed);
}

function verifyGoogleOAuthState(token: string): GoogleOAuthState {
  const env = getEnv();
  const parsed = jwt.verify(token, env.JWT_SECRET);
  return googleStateSchema.parse(parsed);
}

async function fetchFacebookJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof (body as { error?: { message?: string } }).error?.message === 'string'
      ? (body as { error: { message: string } }).error.message
      : `Facebook API xatosi (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}

async function fetchGoogleToken(code: string): Promise<GoogleOAuthTokenPayload> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload as GoogleOAuthTokenPayload;
}

async function fetchGoogleProfile(accessToken: string): Promise<{ id: string; email: string; name?: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google profil olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload as { id: string; email: string; name?: string };
}

async function fetchGoogleSpreadsheets(accessToken: string): Promise<GoogleSpreadsheet[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=100`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google spreadsheet ro'yxatini olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  const files = (payload as { files?: Array<{ id?: string; name?: string }> }).files ?? [];
  return files
    .filter((f): f is { id: string; name: string } => Boolean(f.id && f.name))
    .map((f) => ({ id: f.id, name: f.name }));
}

async function fetchGoogleForms(accessToken: string): Promise<GoogleFormFile[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.form' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=200`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google form ro'yxatini olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  const files = (payload as { files?: Array<{ id?: string; name?: string }> }).files ?? [];
  return files
    .filter((f): f is { id: string; name: string } => Boolean(f.id && f.name))
    .map((f) => ({ id: f.id, name: f.name }));
}

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

function ensureUniqueKey(baseKey: string, seen: Set<string>, questionId: string): string {
  if (!seen.has(baseKey)) return baseKey;
  const withSuffix = `${baseKey}_${questionId.slice(-4).toLowerCase()}`;
  if (!seen.has(withSuffix)) return withSuffix;
  let i = 2;
  while (seen.has(`${withSuffix}_${i}`)) i += 1;
  return `${withSuffix}_${i}`;
}

function toQuestionField(
  questionId: string | undefined,
  itemTitle: string | undefined,
  questionTitle: string | undefined,
  type: string | undefined,
  seen: Set<string>,
): GoogleFormQuestionField | null {
  const qid = (questionId ?? '').trim();
  const label = (questionTitle ?? '').trim() || (itemTitle ?? '').trim();
  if (!qid) return null;
  const baseKey = toSnake(label || qid) || qid;
  const key = ensureUniqueKey(baseKey, seen, qid);
  seen.add(key);
  return {
    key,
    label: label || key,
    type: (type ?? 'text').trim() || 'text',
  };
}

async function fetchGoogleFormFields(accessToken: string, formId: string): Promise<GoogleFormQuestionField[]> {
  const url = `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google form maydonlarini olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }

  const items = (payload as {
    items?: Array<{
      title?: string;
      questionItem?: {
        question?: { questionId?: string; title?: string; question?: { textQuestion?: unknown; choiceQuestion?: unknown; dateQuestion?: unknown; timeQuestion?: unknown; fileUploadQuestion?: unknown } };
      };
      questionGroupItem?: {
        questions?: Array<{ questionId?: string; title?: string; question?: { textQuestion?: unknown; choiceQuestion?: unknown; dateQuestion?: unknown; timeQuestion?: unknown; fileUploadQuestion?: unknown } }>;
      };
    }>;
  }).items ?? [];

  const fields: GoogleFormQuestionField[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const single = item.questionItem?.question;
    if (single) {
      const field = toQuestionField(single.questionId, item.title, single.title, getQuestionType(single.question), seen);
      if (field) fields.push(field);
    }

    for (const grouped of item.questionGroupItem?.questions ?? []) {
      const field = toQuestionField(grouped.questionId, item.title, grouped.title, getQuestionType(grouped.question), seen);
      if (field) fields.push(field);
    }
  }

  return fields;
}

async function fetchGoogleAccessTokenByRefreshToken(refreshToken: string): Promise<string> {
  const env = getEnv();
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
  if (!accessToken) {
    throw new Error('Google access token qaytmadi');
  }
  return accessToken;
}

async function createGoogleSpreadsheet(
  accessToken: string,
  spreadsheetName: string,
  sheetName: string,
): Promise<GoogleSpreadsheetCreateResult> {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: spreadsheetName,
      },
      sheets: [
        {
          properties: {
            title: sheetName,
          },
        },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Sheets create xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }

  const spreadsheetId = (payload as { spreadsheetId?: string }).spreadsheetId;
  if (!spreadsheetId) {
    throw new Error('Google spreadsheet yaratildi, lekin id qaytmadi');
  }

  return {
    spreadsheetId,
    spreadsheetUrl: (payload as { spreadsheetUrl?: string }).spreadsheetUrl,
  };
}

async function writeGoogleSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
): Promise<void> {
  if (headers.length === 0) return;
  const cleaned = headers.map((h) => h.trim()).filter(Boolean);
  if (cleaned.length === 0) return;

  const range = encodeURIComponent(`${sheetName}!A1`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: [cleaned],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google header yozish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
}

async function fetchGoogleSpreadsheetSheets(
  accessToken: string,
  spreadsheetId: string,
): Promise<GoogleSpreadsheetSheet[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(title))`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google listlarni olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }

  const sheets = (payload as { sheets?: Array<{ properties?: { title?: string } }> }).sheets ?? [];
  return sheets
    .map((sheet) => ({ name: sheet.properties?.title?.trim() ?? '' }))
    .filter((sheet): sheet is GoogleSpreadsheetSheet => Boolean(sheet.name));
}

async function fetchGoogleSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[]> {
  const range = encodeURIComponent(`${sheetName}!1:1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?majorDimension=ROWS`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google headerlarni olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }

  const firstRow = (payload as { values?: string[][] }).values?.[0] ?? [];
  return firstRow
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function mergeHeaders(existing: string[], requested: string[]): { merged: string[]; added: string[] } {
  const merged = [...existing];
  const lowerSet = new Set(existing.map((header) => header.toLowerCase()));
  const added: string[] = [];

  for (const item of requested.map((x) => x.trim()).filter(Boolean)) {
    const lower = item.toLowerCase();
    if (lowerSet.has(lower)) continue;
    merged.push(item);
    added.push(item);
    lowerSet.add(lower);
  }

  return { merged, added };
}

function buildDefaultGoogleHeaders(sourceFields: Array<{ key: string; label: string }>): string[] {
  const base = ['Received At', 'Lead ID', 'Page ID', 'Form ID'];
  const dynamic = sourceFields
    .map((f) => f.label?.trim() || f.key?.trim())
    .filter((x): x is string => Boolean(x));
  const unique = Array.from(new Set([...base, ...dynamic]));
  return unique.length > 0 ? unique : ['Received At', 'Lead ID', 'Page ID', 'Form ID', 'Name', 'Phone', 'Email'];
}

async function fetchLeadFormsForPage(
  pageId: string,
  pageAccessToken: string,
  userAccessToken?: string,
): Promise<{ forms: FacebookLeadForm[]; error?: string }> {
  const tokens = [pageAccessToken, userAccessToken].filter((token): token is string => Boolean(token));

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    try {
      const collected = new Map<string, FacebookLeadForm>();
      let afterCursor: string | undefined;

      while (true) {
        const params = new URLSearchParams({
          fields: 'id,name,status',
          limit: '100',
          access_token: token,
        });
        if (afterCursor) params.set('after', afterCursor);

        const url = `${FB_GRAPH_API_BASE}/${pageId}/leadgen_forms?${params.toString()}`;
        const payload = await fetchFacebookJson<{
          data?: FacebookLeadForm[];
          paging?: {
            cursors?: { after?: string };
          };
        }>(url);

        for (const form of payload.data ?? []) {
          if (!form.id) continue;
          collected.set(form.id, form);
        }

        const nextAfter = payload.paging?.cursors?.after;
        if (!nextAfter || nextAfter === afterCursor) {
          break;
        }
        afterCursor = nextAfter;
      }

      return { forms: Array.from(collected.values()) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[facebook:oAuth] leadgen_forms fetch failed page=${pageId} attempt=${i + 1}/${tokens.length}: ${message}`);
    }
  }

  return { forms: [], error: 'leadgen_forms ni olish muvaffaqiyatsiz tugadi (permission yoki access cheklovi)' };
}

async function fetchFacebookPagesByUserToken(userAccessToken: string): Promise<FacebookPage[]> {
  const pagesUrl = `${FB_GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userAccessToken)}`;
  const pagesPayload = await fetchFacebookJson<{ data?: FacebookPage[] }>(pagesUrl);
  return pagesPayload.data ?? [];
}

async function ensurePageLeadgenSubscription(pageId: string, pageAccessToken: string): Promise<void> {
  if (!pageAccessToken) return;

  const response = await fetch(`${FB_GRAPH_API_BASE}/${pageId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      subscribed_fields: 'leadgen',
      access_token: pageAccessToken,
    }).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof (payload as { error?: { message?: string } }).error?.message === 'string'
      ? (payload as { error: { message: string } }).error.message
      : `subscribed_apps xatosi (${response.status})`;
    throw new Error(message);
  }
}

async function fetchFacebookPixels(userAccessToken: string): Promise<FacebookPixel[]> {
  try {
    const url = `${FB_GRAPH_API_BASE}/me/adaccounts?fields=id,name,account_id,owned_pixels{id,name}&access_token=${encodeURIComponent(userAccessToken)}`;
    const payload = await fetchFacebookJson<{
      data?: Array<{
        id?: string;
        name?: string;
        account_id?: string;
        owned_pixels?: { data?: Array<{ id?: string; name?: string }> };
      }>;
    }>(url);

    const byId = new Map<string, FacebookPixel>();
    for (const account of payload.data ?? []) {
      const accountId = account.account_id ?? account.id;
      const accountName = account.name;
      for (const pixel of account.owned_pixels?.data ?? []) {
        if (!pixel.id) continue;
        byId.set(pixel.id, {
          id: pixel.id,
          name: pixel.name ?? pixel.id,
          ad_account_id: accountId,
          ad_account_name: accountName,
        });
      }
    }
    return Array.from(byId.values());
  } catch {
    return [];
  }
}

function normalizeBitrixWebhookUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function callbackHtml(payload: Record<string, unknown>, targetOrigin: string): string {
  return `<!doctype html>
<html>
  <body>
    <script>
      (function () {
        var data = ${JSON.stringify(payload)};
        try {
          localStorage.setItem('leadflow-facebook-oauth-result', JSON.stringify(data));
        } catch (e) {}
        if (window.opener) {
          window.opener.postMessage(data, ${JSON.stringify(targetOrigin)});
        }
        setTimeout(function () { window.close(); }, 200);
      })();
    </script>
  </body>
</html>`;
}

// Public callback endpoint for Facebook popup OAuth
router.get('/facebook/oauth/callback', async (req, res) => {
  // Helmet CSP inline scriptlarni bloklaydi; popup callback sahifasi postMessage uchun
  // qisqa inline script ishlatadi, shu route uchun policy ni yumshatamiz.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none';",
  );
  // Popup callback sahifasi frontend oynasiga postMessage yuborishi uchun
  // opener aloqasini uzib yuboradigan COOP ni bu route da o'chiramiz.
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cache-Control', 'no-store');

  const stateToken = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';

  try {
    if (!stateToken || !code) {
      throw new Error('OAuth callback parametrlari toliq emas');
    }

    const state = verifyFacebookOAuthState(stateToken);
    const env = getEnv();

    const tokenUrl = `${FB_GRAPH_API_BASE}/oauth/access_token?client_id=${encodeURIComponent(env.FB_APP_ID)}&redirect_uri=${encodeURIComponent(env.FB_OAUTH_REDIRECT_URI)}&client_secret=${encodeURIComponent(env.FB_APP_SECRET)}&code=${encodeURIComponent(code)}`;
    const tokenPayload = await fetchFacebookJson<{ access_token: string }>(tokenUrl);

    const longTokenUrl = `${FB_GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(env.FB_APP_ID)}&client_secret=${encodeURIComponent(env.FB_APP_SECRET)}&fb_exchange_token=${encodeURIComponent(tokenPayload.access_token)}`;
    const longTokenPayload = await fetchFacebookJson<{ access_token: string }>(longTokenUrl).catch(() => tokenPayload);
    const userAccessToken = longTokenPayload.access_token;

    const meUrl = `${FB_GRAPH_API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(userAccessToken)}`;
    const me = await fetchFacebookJson<{ id: string; name: string }>(meUrl);

    const pages = await fetchFacebookPagesByUserToken(userAccessToken);

    const formFetchErrors: FacebookFormsFetchError[] = [];
    const pagesWithForms = await Promise.all(
      pages.map(async (page) => {
        try {
          await ensurePageLeadgenSubscription(page.id, page.access_token);
        } catch (err) {
          formFetchErrors.push({
            page_id: page.id,
            page_name: page.name,
            error: `Page subscribe xatosi: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        const formsResult = await fetchLeadFormsForPage(page.id, page.access_token, userAccessToken);
        if (formsResult.error) {
          formFetchErrors.push({
            page_id: page.id,
            page_name: page.name,
            error: formsResult.error,
          });
        }
        return {
          ...page,
          forms: formsResult.forms,
        };
      }),
    );
    const pixels = await fetchFacebookPixels(userAccessToken);

    const oauthResult: FacebookOAuthResult = {
      success: true,
      payload: {
        profile: { id: me.id, name: me.name, user_id: state.userId },
        pages: pagesWithForms,
        pixels,
        user_access_token: userAccessToken,
        form_fetch_errors: formFetchErrors,
      },
    };
    facebookOAuthStore.set(stateToken, {
      userId: state.userId,
      createdAt: Date.now(),
      status: 'done',
      result: oauthResult,
    });

    const targetOrigin = state.origin || '*';
    res.status(200).send(
      callbackHtml(
        {
          source: 'leadflow-facebook-oauth',
          ...oauthResult,
        },
        targetOrigin,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Facebook OAuth callback xatosi';
    if (stateToken) {
      try {
        const state = verifyFacebookOAuthState(stateToken);
        facebookOAuthStore.set(stateToken, {
          userId: state.userId,
          createdAt: Date.now(),
          status: 'done',
          result: {
            success: false,
            error: message,
          },
        });
      } catch {
        // state parse failed; cannot bind result to user
      }
    }
    res.status(200).send(
      callbackHtml(
        {
          source: 'leadflow-facebook-oauth',
          success: false,
          error: message,
        },
        '*',
      ),
    );
  }
});

// Public callback endpoint for Google popup OAuth
router.get('/google/oauth/callback', async (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none';",
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cache-Control', 'no-store');

  const stateToken = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';

  try {
    if (!stateToken || !code) {
      throw new Error('Google OAuth callback parametrlari toliq emas');
    }

    const state = verifyGoogleOAuthState(stateToken);
    const token = await fetchGoogleToken(code);
    const profile = await fetchGoogleProfile(token.access_token);
    const spreadsheets = await fetchGoogleSpreadsheets(token.access_token);

    if (!token.refresh_token) {
      throw new Error('Google refresh_token qaytmadi. Account accessni revoke qilib qayta ulanish qiling.');
    }

    const oauthResult: GoogleOAuthResult = {
      success: true,
      payload: {
        profile,
        refresh_token: token.refresh_token,
        spreadsheets,
      },
    };

    googleOAuthStore.set(stateToken, {
      userId: state.userId,
      createdAt: Date.now(),
      status: 'done',
      result: oauthResult,
    });

    res.status(200).send(
      callbackHtml(
        {
          source: 'leadflow-google-oauth',
          ...oauthResult,
        },
        state.origin || '*',
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google OAuth callback xatosi';
    if (stateToken) {
      try {
        const state = verifyGoogleOAuthState(stateToken);
        googleOAuthStore.set(stateToken, {
          userId: state.userId,
          createdAt: Date.now(),
          status: 'done',
          result: {
            success: false,
            error: message,
          },
        });
      } catch {
        // ignore invalid state parse
      }
    }

    res.status(200).send(
      callbackHtml(
        {
          source: 'leadflow-google-oauth',
          success: false,
          error: message,
        },
        '*',
      ),
    );
  }
});

// All routes below require auth
router.use(requireAuth);

router.get('/facebook/oauth/init', async (req, res, next) => {
  try {
    cleanupFacebookOAuthStore();
    const env = getEnv();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const state = signFacebookOAuthState({ userId: req.user!.userId, origin });
    facebookOAuthStore.set(state, {
      userId: req.user!.userId,
      createdAt: Date.now(),
      status: 'pending',
    });
    const blockedOauthScopes = new Set(['leads_retrieval']);
    const requestedScopes = Array.from(new Set(
      env.FB_OAUTH_SCOPES
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !blockedOauthScopes.has(item)),
    ));
    const scope = requestedScopes.join(',');

    const params = new URLSearchParams({
      client_id: env.FB_APP_ID,
      redirect_uri: env.FB_OAUTH_REDIRECT_URI,
      state,
      scope,
      response_type: 'code',
    });
    if (env.FB_OAUTH_CONFIG_ID) {
      params.set('config_id', env.FB_OAUTH_CONFIG_ID);
    }
    const authUrl = `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}`;
    res.json({ auth_url: authUrl, state });
  } catch (err) {
    next(err);
  }
});

router.get('/google/oauth/init', async (req, res, next) => {
  try {
    cleanupGoogleOAuthStore();
    const env = getEnv();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const state = signGoogleOAuthState({ userId: req.user!.userId, origin });
    googleOAuthStore.set(state, {
      userId: req.user!.userId,
      createdAt: Date.now(),
      status: 'pending',
    });

    const scope = [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/forms.responses.readonly',
      'https://www.googleapis.com/auth/forms.body.readonly',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_OAUTH_CLIENT_ID)}&redirect_uri=${encodeURIComponent(env.GOOGLE_OAUTH_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&access_type=offline&prompt=consent&include_granted_scopes=true`;
    res.json({ auth_url: authUrl, state });
  } catch (err) {
    next(err);
  }
});

router.get('/facebook/oauth/result', async (req, res, next) => {
  try {
    cleanupFacebookOAuthStore();
    const stateToken = typeof req.query.state === 'string' ? req.query.state : '';
    if (!stateToken) {
      throw new AppError(400, 'OAuth state berilmagan');
    }

    const state = verifyFacebookOAuthState(stateToken);
    if (state.userId !== req.user!.userId) {
      throw new AppError(403, 'Bu OAuth state sizga tegishli emas');
    }

    const entry = facebookOAuthStore.get(stateToken);
    if (!entry || entry.status === 'pending' || !entry.result) {
      res.json({ status: 'pending' });
      return;
    }

    facebookOAuthStore.delete(stateToken);
    res.json({ status: 'done', ...entry.result });
  } catch (err) {
    next(err);
  }
});

router.get('/google/oauth/result', async (req, res, next) => {
  try {
    cleanupGoogleOAuthStore();
    const stateToken = typeof req.query.state === 'string' ? req.query.state : '';
    if (!stateToken) {
      throw new AppError(400, 'OAuth state berilmagan');
    }

    const state = verifyGoogleOAuthState(stateToken);
    if (state.userId !== req.user!.userId) {
      throw new AppError(403, 'Bu OAuth state sizga tegishli emas');
    }

    const entry = googleOAuthStore.get(stateToken);
    if (!entry || entry.status === 'pending' || !entry.result) {
      res.json({ status: 'pending' });
      return;
    }

    googleOAuthStore.delete(stateToken);
    res.json({ status: 'done', ...entry.result });
  } catch (err) {
    next(err);
  }
});

const googleCreateSpreadsheetSchema = z.object({
  connection_id: z.string().uuid('Google connection id noto\'g\'ri'),
  spreadsheet_name: z.string().trim().optional(),
  sheet_name: z.string().trim().optional(),
  header_mode: z.enum(['default', 'custom', 'none']).default('default'),
  custom_headers: z.array(z.string()).optional(),
  column_mappings: z.array(
    z.object({
      source_field: z.string().min(1),
      column_title: z.string().min(1),
    }),
  ).optional(),
  source_fields: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
    }),
  ).optional(),
});

const googleSpreadsheetMetaSchema = z.object({
  connection_id: z.string().uuid('Google connection id noto\'g\'ri'),
  spreadsheet_id: z.string().min(1, 'Spreadsheet id kiritilishi shart'),
  sheet_name: z.string().trim().optional(),
});

const googleSpreadsheetSyncColumnsSchema = z.object({
  connection_id: z.string().uuid('Google connection id noto\'g\'ri'),
  spreadsheet_id: z.string().min(1, 'Spreadsheet id kiritilishi shart'),
  sheet_name: z.string().min(1, 'Sheet name kiritilishi shart'),
  columns: z.array(z.string().min(1)).min(1, 'Kamida bitta column bo\'lishi kerak'),
});

const googleFormsListSchema = z.object({
  connection_id: z.string().uuid('Google connection id noto\'g\'ri'),
});
const googleFormFieldsSchema = z.object({
  connection_id: z.string().uuid('Google connection id noto\'g\'ri'),
  form_id: z.string().min(1, 'Google Form ID kiritilishi shart'),
});

router.post('/google/spreadsheets', async (req, res, next) => {
  try {
    const body = googleCreateSpreadsheetSchema.parse(req.body);
    const pool = getPool();
    const connResult = await pool.query(
      'SELECT id, credentials, meta FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
      [body.connection_id, req.user!.userId, 'google'],
    );
    if (connResult.rows.length === 0) {
      throw new AppError(404, 'Google ulanish topilmadi');
    }

    const connRow = connResult.rows[0];
    const creds = JSON.parse(decrypt(String(connRow.credentials))) as { refresh_token?: string };
    if (!creds.refresh_token) {
      throw new AppError(400, 'Google refresh token topilmadi');
    }

    const now = new Date();
    const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const spreadsheetName = body.spreadsheet_name && body.spreadsheet_name.length > 0
      ? body.spreadsheet_name
      : `LeadFlow Leads ${datePart}`;
    const sheetName = body.sheet_name && body.sheet_name.length > 0
      ? body.sheet_name
      : 'Leads';

    const accessToken = await fetchGoogleAccessTokenByRefreshToken(creds.refresh_token);
    const created = await createGoogleSpreadsheet(accessToken, spreadsheetName, sheetName);

    if (body.header_mode !== 'none') {
      const headers = body.header_mode === 'custom'
        ? ((body.column_mappings ?? []).map((item) => item.column_title).filter(Boolean).length > 0
          ? (body.column_mappings ?? []).map((item) => item.column_title)
          : (body.custom_headers ?? []))
        : buildDefaultGoogleHeaders(body.source_fields ?? []);
      await writeGoogleSheetHeaders(accessToken, created.spreadsheetId, sheetName, headers);
    }

    const currentMeta = (connRow.meta ?? {}) as { spreadsheets?: GoogleSpreadsheet[]; [key: string]: unknown };
    const currentSpreadsheets = Array.isArray(currentMeta.spreadsheets) ? currentMeta.spreadsheets : [];
    const nextSpreadsheets = [
      ...currentSpreadsheets.filter((item) => item.id !== created.spreadsheetId),
      { id: created.spreadsheetId, name: spreadsheetName },
    ];
    const nextMeta = { ...currentMeta, spreadsheets: nextSpreadsheets };
    await pool.query('UPDATE connections SET meta = $1::jsonb, updated_at = NOW() WHERE id = $2 AND user_id = $3', [
      JSON.stringify(nextMeta),
      connRow.id,
      req.user!.userId,
    ]);

    res.status(201).json({
      spreadsheet: {
        id: created.spreadsheetId,
        name: spreadsheetName,
        sheet_name: sheetName,
        url: created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.post('/google/spreadsheets/meta', async (req, res, next) => {
  try {
    const body = googleSpreadsheetMetaSchema.parse(req.body);
    const pool = getPool();
    const connResult = await pool.query(
      'SELECT id, credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
      [body.connection_id, req.user!.userId, 'google'],
    );
    if (connResult.rows.length === 0) {
      throw new AppError(404, 'Google ulanish topilmadi');
    }

    const creds = JSON.parse(decrypt(String(connResult.rows[0].credentials))) as { refresh_token?: string };
    if (!creds.refresh_token) {
      throw new AppError(400, 'Google refresh token topilmadi');
    }

    const accessToken = await fetchGoogleAccessTokenByRefreshToken(creds.refresh_token);
    const sheets = await fetchGoogleSpreadsheetSheets(accessToken, body.spreadsheet_id);
    const selectedSheetName = body.sheet_name && body.sheet_name.length > 0
      ? body.sheet_name
      : (sheets[0]?.name ?? 'Sheet1');
    const headers = await fetchGoogleSheetHeaders(accessToken, body.spreadsheet_id, selectedSheetName);

    res.json({
      spreadsheet_id: body.spreadsheet_id,
      selected_sheet_name: selectedSheetName,
      sheets,
      headers,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.post('/google/spreadsheets/sync-columns', async (req, res, next) => {
  try {
    const body = googleSpreadsheetSyncColumnsSchema.parse(req.body);
    const pool = getPool();
    const connResult = await pool.query(
      'SELECT id, credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
      [body.connection_id, req.user!.userId, 'google'],
    );
    if (connResult.rows.length === 0) {
      throw new AppError(404, 'Google ulanish topilmadi');
    }

    const creds = JSON.parse(decrypt(String(connResult.rows[0].credentials))) as { refresh_token?: string };
    if (!creds.refresh_token) {
      throw new AppError(400, 'Google refresh token topilmadi');
    }

    const accessToken = await fetchGoogleAccessTokenByRefreshToken(creds.refresh_token);
    const existingHeaders = await fetchGoogleSheetHeaders(accessToken, body.spreadsheet_id, body.sheet_name);
    const { merged, added } = mergeHeaders(existingHeaders, body.columns);
    if (added.length > 0) {
      await writeGoogleSheetHeaders(accessToken, body.spreadsheet_id, body.sheet_name, merged);
    }

    res.json({
      sheet_name: body.sheet_name,
      headers: merged,
      added,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.get('/google/forms', async (req, res, next) => {
  try {
    const query = googleFormsListSchema.parse(req.query);
    const pool = getPool();
    const connResult = await pool.query(
      'SELECT id, credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
      [query.connection_id, req.user!.userId, 'google'],
    );
    if (connResult.rows.length === 0) {
      throw new AppError(404, 'Google ulanish topilmadi');
    }

    const creds = JSON.parse(decrypt(String(connResult.rows[0].credentials))) as { refresh_token?: string };
    if (!creds.refresh_token) {
      throw new AppError(400, 'Google refresh token topilmadi');
    }

    const accessToken = await fetchGoogleAccessTokenByRefreshToken(creds.refresh_token);
    const forms = await fetchGoogleForms(accessToken);
    res.json({ forms, total: forms.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.get('/google/form-fields', async (req, res, next) => {
  try {
    const query = googleFormFieldsSchema.parse(req.query);
    const pool = getPool();
    const connResult = await pool.query(
      'SELECT id, credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
      [query.connection_id, req.user!.userId, 'google'],
    );
    if (connResult.rows.length === 0) {
      throw new AppError(404, 'Google ulanish topilmadi');
    }

    const creds = JSON.parse(decrypt(String(connResult.rows[0].credentials))) as { refresh_token?: string };
    if (!creds.refresh_token) {
      throw new AppError(400, 'Google refresh token topilmadi');
    }

    const accessToken = await fetchGoogleAccessTokenByRefreshToken(creds.refresh_token);
    const fields = await fetchGoogleFormFields(accessToken, query.form_id);
    res.json({ fields, total: fields.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

const facebookFormFieldsSchema = z.object({
  form_id: z.string().min(1, 'form_id kiritilishi shart'),
  page_access_token: z.string().min(1).optional(),
  connection_id: z.string().uuid().optional(),
  page_id: z.string().min(1).optional(),
});

const facebookRefreshFormsSchema = z.object({
  connection_id: z.string().uuid('Facebook connection id noto\'g\'ri'),
});

router.post('/facebook/form-fields', async (req, res, next) => {
  try {
    const body = facebookFormFieldsSchema.parse(req.body);
    let pageAccessToken = body.page_access_token ?? '';
    if (!pageAccessToken && body.connection_id && body.page_id) {
      const pool = getPool();
      const result = await pool.query(
        'SELECT credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
        [body.connection_id, req.user!.userId, 'facebook'],
      );
      if (result.rows.length === 0) {
        throw new AppError(404, 'Facebook ulanish topilmadi');
      }

      const parsed = JSON.parse(decrypt(String(result.rows[0].credentials))) as {
        pages?: Array<{ id: string; access_token: string }>;
      };
      const page = (parsed.pages ?? []).find((p) => p.id === body.page_id);
      if (!page?.access_token) {
        throw new AppError(400, 'Tanlangan sahifa access token topilmadi');
      }
      pageAccessToken = page.access_token;
    }

    if (!pageAccessToken) {
      throw new AppError(400, 'page_access_token yoki connection_id+page_id berilishi shart');
    }

    const url = `${FB_GRAPH_API_BASE}/${encodeURIComponent(body.form_id)}?fields=questions&access_token=${encodeURIComponent(pageAccessToken)}`;
    const payload = await fetchFacebookJson<{ questions?: FacebookFormQuestion[] }>(url);

    const questions = payload.questions ?? [];
    const fields = questions
      .map((q) => {
        const key = (q.key ?? '').trim();
        const label = (q.label ?? key).trim();
        if (!key || !label) return null;
        return {
          key,
          label,
          type: q.type ?? 'text',
        };
      })
      .filter((x): x is { key: string; label: string; type: string } => Boolean(x));

    res.json({ fields, total: fields.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.post('/facebook/forms/refresh', async (req, res, next) => {
  try {
    const body = facebookRefreshFormsSchema.parse(req.body);
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, name, credentials, meta FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
      [body.connection_id, req.user!.userId, 'facebook'],
    );
    if (result.rows.length === 0) {
      throw new AppError(404, 'Facebook ulanish topilmadi');
    }

    const row = result.rows[0];
    const creds = JSON.parse(decrypt(String(row.credentials))) as {
      user_access_token?: string;
      pages?: Array<{ id: string; name?: string; access_token?: string; forms?: FacebookLeadForm[] }>;
    };
    let pages = Array.isArray(creds.pages) ? creds.pages : [];
    if (pages.length === 0 && creds.user_access_token) {
      const fetchedPages = await fetchFacebookPagesByUserToken(creds.user_access_token);
      pages = fetchedPages.map((page) => ({
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        forms: [],
      }));
    }
    if (pages.length === 0) {
      throw new AppError(400, 'Facebook sahifalari topilmadi. Sahifa ruxsatlarini (pages_show_list/pages_read_engagement) qayta tasdiqlab ulang.');
    }

    const errors: FacebookFormsFetchError[] = [];
    const refreshedPages = await Promise.all(
      pages.map(async (page) => {
        try {
          await ensurePageLeadgenSubscription(page.id, page.access_token ?? '');
        } catch (err) {
          errors.push({
            page_id: page.id,
            page_name: page.name,
            error: `Page subscribe xatosi: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        const token = page.access_token ?? '';
        const formsResult = await fetchLeadFormsForPage(page.id, token, creds.user_access_token);
        if (formsResult.error) {
          errors.push({
            page_id: page.id,
            page_name: page.name,
            error: formsResult.error,
          });
        }
        return {
          ...page,
          forms: formsResult.forms,
        };
      }),
    );

    const nextCreds = { ...creds, pages: refreshedPages };
    const currentMeta = (row.meta ?? {}) as Record<string, unknown>;
    const nextMeta = {
      ...currentMeta,
      pages: refreshedPages.map((page) => ({
        id: page.id,
        name: page.name ?? page.id,
        forms: page.forms ?? [],
      })),
      form_fetch_errors: errors,
    };

    await pool.query(
      'UPDATE connections SET credentials = $1, meta = $2::jsonb, updated_at = NOW() WHERE id = $3 AND user_id = $4',
      [encrypt(JSON.stringify(nextCreds)), JSON.stringify(nextMeta), row.id, req.user!.userId],
    );

    const totalForms = refreshedPages.reduce((acc, page) => acc + ((page.forms ?? []).length), 0);
    res.json({
      pages: refreshedPages.map((page) => ({
        id: page.id,
        name: page.name ?? page.id,
        forms: page.forms ?? [],
      })),
      total_pages: refreshedPages.length,
      total_forms: totalForms,
      errors,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

const bitrixFieldsSchema = z.object({
  webhook_url: z.string().url('Bitrix24 Webhook URL noto\'g\'ri'),
});

router.post('/bitrix/fields', async (req, res, next) => {
  try {
    const body = bitrixFieldsSchema.parse(req.body);
    const endpoint = `${normalizeBitrixWebhookUrl(body.webhook_url)}crm.lead.fields.json`;

    const response = await fetch(endpoint);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new AppError(400, `Bitrix24 maydonlarini olishda xato (${response.status})`);
    }

    if (typeof (payload as { error?: string }).error === 'string') {
      const details = (payload as { error_description?: string }).error_description ?? 'Noma\'lum xato';
      throw new AppError(400, `Bitrix24 credentials xato: ${details}`);
    }

    const fieldsObj = (payload as { result?: Record<string, BitrixLeadFieldMeta> }).result ?? {};
    const fields = Object.entries(fieldsObj)
      .map(([code, meta]) => ({
        code,
        title: meta.title ?? code,
        type: meta.type ?? 'string',
        required: meta.isRequired === true || meta.isRequired === 'Y',
        multiple: meta.isMultiple === true || meta.isMultiple === 'Y',
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    res.json({ fields, total: fields.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().min(1, 'Nom kiritilishi shart'),
  source_type: z.enum(['facebook', 'google_forms']).default('facebook'),
  source_connection_id: z.string().uuid().optional(),
  source_page_id: z.string().optional(),
  source_page_access_token: z.string().optional(),
  source_form_id: z.string().nullable().optional(),
  dest_type: z.enum(['bitrix24', 'amocrm', 'google_sheets']).default('bitrix24'),
  dest_connection_id: z.string().uuid().optional(),
  dest_resource_id: z.string().optional(),
  dest_sheet_name: z.string().optional(),
  dest_columns: z.array(
    z.object({
      source_field: z.string().min(1),
      column_title: z.string().min(1),
    }),
  ).optional(),
  dest_credentials: z.string().optional(),
  field_mapping: z.record(z.string()).default({}),
  notify_telegram_chat_id: z.string().nullable().optional(),
  dedup_enabled: z.boolean().default(true),
  dedup_field: z.enum(['phone', 'email']).default('phone'),
});

const updateSchema = createSchema.partial();

function sanitizeIntegration(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    source_type: row.source_type,
    source_page_id: row.source_page_id,
    source_form_id: row.source_form_id,
    dest_type: row.dest_type,
    dest_credentials_set: !!row.dest_credentials,
    field_mapping: row.field_mapping,
    notify_telegram_chat_id: row.notify_telegram_chat_id,
    dedup_enabled: row.dedup_enabled,
    dedup_field: row.dedup_field,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findOwnedIntegration(integrationId: string, userId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM integrations WHERE id = $1 AND user_id = $2`,
    [integrationId, userId],
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Integratsiya topilmadi');
  }
  return result.rows[0];
}

async function ensureNoActiveDuplicateIntegration(params: {
  userId: string;
  sourceType: string;
  sourcePageId: string | null;
  sourceFormId: string | null;
  destType: string;
  destCredentialsPlain: string;
  excludeIntegrationId?: string;
}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, name, dest_credentials
     FROM integrations
     WHERE user_id = $1
       AND active = true
       AND source_type = $2
       AND dest_type = $3
       AND (($4::text IS NULL AND source_page_id IS NULL) OR source_page_id = $4)
       AND (($5::text IS NULL AND source_form_id IS NULL) OR source_form_id = $5)
       AND ($6::uuid IS NULL OR id <> $6)`,
    [
      params.userId,
      params.sourceType,
      params.destType,
      params.sourcePageId,
      params.sourceFormId,
      params.excludeIntegrationId ?? null,
    ],
  );

  for (const row of result.rows) {
    const existingPlain = decrypt(String(row.dest_credentials));
    if (existingPlain === params.destCredentialsPlain) {
      throw new AppError(
        409,
        `Bir xil manba/maqsad/credential bilan faol integratsiya allaqachon mavjud: ${row.name} (${row.id})`,
      );
    }
  }
}

async function ensureFacebookSourceOwnership(params: {
  userId: string;
  sourcePageId: string | null;
  sourceFormId: string | null;
  excludeIntegrationId?: string;
}) {
  if (!params.sourcePageId) return;

  const pool = getPool();
  const result = await pool.query(
    `SELECT i.id, i.name, u.email
     FROM integrations i
     JOIN users u ON u.id = i.user_id
     WHERE i.active = true
       AND i.source_type = 'facebook'
       AND i.source_page_id = $1
       AND ($2::text IS NULL OR i.source_form_id IS NULL OR i.source_form_id = $2)
       AND i.user_id <> $3
       AND ($4::uuid IS NULL OR i.id <> $4)
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    [
      params.sourcePageId,
      params.sourceFormId,
      params.userId,
      params.excludeIntegrationId ?? null,
    ],
  );

  if (result.rows.length > 0) {
    const row = result.rows[0] as { id: string; name: string; email: string };
    throw new AppError(
      409,
      `Bu Facebook source allaqachon boshqa akkauntga ulangan: ${row.name} (${row.email}). Davom etish uchun avval o'sha akkauntdagi integratsiyani o'chiring.`,
    );
  }
}

router.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const pool = getPool();

    let sourcePageToken = body.source_page_access_token ?? '';
    if (body.source_type === 'facebook' && !sourcePageToken && body.source_connection_id && body.source_page_id) {
      const sourceConnResult = await pool.query(
        'SELECT credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
        [body.source_connection_id, req.user!.userId, 'facebook'],
      );
      if (sourceConnResult.rows.length === 0) {
        throw new AppError(400, 'Facebook ulanish topilmadi');
      }
      const sourceCreds = JSON.parse(decrypt(String(sourceConnResult.rows[0].credentials))) as {
        pages?: Array<{ id: string; access_token: string }>;
      };
      const page = (sourceCreds.pages ?? []).find((p) => p.id === body.source_page_id);
      if (!page?.access_token) {
        throw new AppError(400, 'Tanlangan Facebook sahifa tokeni topilmadi');
      }
      sourcePageToken = page.access_token;
    }

    let destinationCredentials = body.dest_credentials ?? '';
    if (!destinationCredentials && body.dest_type === 'google_sheets' && body.dest_connection_id && body.dest_resource_id) {
      const destConnResult = await pool.query(
        'SELECT credentials FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
        [body.dest_connection_id, req.user!.userId, 'google'],
      );
      if (destConnResult.rows.length === 0) {
        throw new AppError(400, 'Google ulanish topilmadi');
      }
      const googleCreds = JSON.parse(decrypt(String(destConnResult.rows[0].credentials))) as {
        refresh_token?: string;
      };
      if (!googleCreds.refresh_token) {
        throw new AppError(400, 'Google refresh token topilmadi');
      }

      destinationCredentials = JSON.stringify({
        mode: 'oauth',
        refresh_token: googleCreds.refresh_token,
        spreadsheet_id: body.dest_resource_id,
        sheet_name: body.dest_sheet_name ?? 'Sheet1',
        columns: body.dest_columns ?? [],
      });
    }

    if (body.source_type === 'facebook' && !body.source_page_id) {
      throw new AppError(400, 'Facebook source uchun sahifa tanlanishi shart');
    }
    if (body.source_type === 'facebook' && !sourcePageToken) {
      throw new AppError(400, 'Facebook page access token kiritilishi shart');
    }
    if (body.source_type === 'google_forms' && !body.source_form_id) {
      throw new AppError(400, 'Google Forms source uchun form_id kiritilishi shart');
    }
    if (body.source_type === 'google_forms' && !body.source_connection_id) {
      throw new AppError(400, 'Google Forms source uchun Google ulanish tanlanishi shart');
    }
    if (body.source_type === 'google_forms') {
      const sourceConnResult = await pool.query(
        'SELECT id FROM connections WHERE id = $1 AND user_id = $2 AND provider = $3',
        [body.source_connection_id, req.user!.userId, 'google'],
      );
      if (sourceConnResult.rows.length === 0) {
        throw new AppError(400, 'Google ulanish topilmadi');
      }
    }
    if (!destinationCredentials) {
      throw new AppError(400, 'CRM credentials kiritilishi shart');
    }

    await ensureNoActiveDuplicateIntegration({
      userId: req.user!.userId,
      sourceType: body.source_type,
      sourcePageId: body.source_type === 'google_forms'
        ? (body.source_connection_id ?? null)
        : (body.source_page_id ?? null),
      sourceFormId: body.source_form_id ?? null,
      destType: body.dest_type,
      destCredentialsPlain: destinationCredentials,
    });
    if (body.source_type === 'facebook') {
      await ensureFacebookSourceOwnership({
        userId: req.user!.userId,
        sourcePageId: body.source_page_id ?? null,
        sourceFormId: body.source_form_id ?? null,
      });
    }

    const encryptedCreds = encrypt(destinationCredentials);
    const encryptedPageToken = sourcePageToken ? encrypt(sourcePageToken) : null;

    const result = await pool.query(
      `INSERT INTO integrations (
        user_id, name, source_type, source_page_id, source_page_access_token,
        source_form_id, dest_type, dest_credentials, field_mapping,
        notify_telegram_chat_id, dedup_enabled, dedup_field
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        req.user!.userId, body.name, body.source_type,
        body.source_type === 'google_forms' ? (body.source_connection_id ?? null) : (body.source_page_id ?? null),
        encryptedPageToken,
        body.source_form_id ?? null,
        body.dest_type, encryptedCreds,
        JSON.stringify(body.field_mapping), body.notify_telegram_chat_id ?? null,
        body.dedup_enabled, body.dedup_field,
      ],
    );

    res.status(201).json(sanitizeIntegration(result.rows[0]));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM integrations WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.userId],
    );
    res.json(result.rows.map(sanitizeIntegration));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/preflight', async (req, res, next) => {
  try {
    const row = await findOwnedIntegration(req.params.id, req.user!.userId);
    const report = await runIntegrationPreflight({
      id: row.id,
      active: row.active,
      source_type: row.source_type,
      source_page_id: row.source_page_id,
      source_page_access_token: row.source_page_access_token,
      source_form_id: row.source_form_id,
      dest_type: row.dest_type,
      dest_credentials: row.dest_credentials,
    });

    const passCount = report.checks.filter((c) => c.status === 'pass').length;
    const warnCount = report.checks.filter((c) => c.status === 'warn').length;
    const failCount = report.checks.filter((c) => c.status === 'fail').length;

    // eslint-disable-next-line no-console
    console.log(
      `[integration:preflight] integration_id=${row.id} status=${report.overall_status} pass=${passCount} warn=${warnCount} fail=${failCount}`,
    );

    res.json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await findOwnedIntegration(req.params.id, req.user!.userId);
    res.json(sanitizeIntegration(row));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const existing = await findOwnedIntegration(req.params.id, req.user!.userId);

    const pool = getPool();
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;

      if (key === 'dest_credentials') {
        sets.push(`dest_credentials = $${idx++}`);
        values.push(encrypt(value as string));
      } else if (key === 'source_page_access_token') {
        sets.push(`source_page_access_token = $${idx++}`);
        values.push(value ? encrypt(value as string) : null);
      } else if (key === 'field_mapping') {
        sets.push(`field_mapping = $${idx++}`);
        values.push(JSON.stringify(value));
      } else {
        sets.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }

    if (sets.length === 0) {
      throw new AppError(400, 'Yangilash uchun malumot berilmagan');
    }

    const mergedSourceType = (body.source_type ?? existing.source_type) as string;
    const mergedSourcePageId = (
      body.source_page_id ?? existing.source_page_id
    ) as string | null;
    const mergedSourceFormId = (
      body.source_form_id ?? existing.source_form_id
    ) as string | null;
    const mergedDestType = (body.dest_type ?? existing.dest_type) as string;
    const mergedActive = Boolean(existing.active);
    const mergedDestCredentialsPlain = typeof body.dest_credentials === 'string'
      ? body.dest_credentials
      : decrypt(String(existing.dest_credentials));

    if (mergedActive) {
      await ensureNoActiveDuplicateIntegration({
        userId: req.user!.userId,
        sourceType: mergedSourceType,
        sourcePageId: mergedSourcePageId,
        sourceFormId: mergedSourceFormId,
        destType: mergedDestType,
        destCredentialsPlain: mergedDestCredentialsPlain,
        excludeIntegrationId: req.params.id,
      });
      if (mergedSourceType === 'facebook') {
        await ensureFacebookSourceOwnership({
          userId: req.user!.userId,
          sourcePageId: mergedSourcePageId,
          sourceFormId: mergedSourceFormId,
          excludeIntegrationId: req.params.id,
        });
      }
    }

    sets.push(`updated_at = NOW()`);
    values.push(req.params.id, req.user!.userId);

    const result = await pool.query(
      `UPDATE integrations SET ${sets.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING *`,
      values,
    );

    res.json(sanitizeIntegration(result.rows[0]));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await findOwnedIntegration(req.params.id, req.user!.userId);

    const pool = getPool();
    await pool.query(
      `UPDATE integrations
       SET active = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.userId],
    );

    res.json({ message: 'Integratsiya faol emas holatga o\'tkazildi' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/toggle', async (req, res, next) => {
  try {
    const row = await findOwnedIntegration(req.params.id, req.user!.userId);

    if (!row.active) {
      await ensureNoActiveDuplicateIntegration({
        userId: req.user!.userId,
        sourceType: row.source_type as string,
        sourcePageId: (row.source_page_id as string | null) ?? null,
        sourceFormId: (row.source_form_id as string | null) ?? null,
        destType: row.dest_type as string,
        destCredentialsPlain: decrypt(String(row.dest_credentials ?? '')),
        excludeIntegrationId: req.params.id,
      });
      if ((row.source_type as string) === 'facebook') {
        await ensureFacebookSourceOwnership({
          userId: req.user!.userId,
          sourcePageId: (row.source_page_id as string | null) ?? null,
          sourceFormId: (row.source_form_id as string | null) ?? null,
          excludeIntegrationId: req.params.id,
        });
      }
    }

    const pool = getPool();
    const result = await pool.query(
      `UPDATE integrations SET active = NOT active, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user!.userId],
    );

    res.json(sanitizeIntegration(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/test', async (req, res, next) => {
  try {
    const row = await findOwnedIntegration(req.params.id, req.user!.userId);

    if (!row.dest_credentials) {
      throw new AppError(400, 'CRM credentials ornatilmagan');
    }

    const credentials = decrypt(row.dest_credentials as string);
    const adapter = await getCrmAdapter(row.dest_type as string, credentials);

    const testLead: NormalizedLead = {
      id: 'test-lead-000',
      name: 'Test Foydalanuvchi',
      phone: '+998901234567',
      email: 'test@example.com',
      rawFields: {
        full_name: 'Test Foydalanuvchi',
        phone_number: '+998901234567',
        email: 'test@example.com',
      },
      adId: null,
      adName: 'Test Ad',
      adSetId: null,
      adSetName: null,
      campaignId: null,
      campaignName: null,
      formId: null,
      pageId: row.source_page_id as string ?? null,
      createdAt: new Date().toISOString(),
    };

    const result = await adapter.deliver(testLead, (row.field_mapping as Record<string, string>) ?? {});

    res.json({
      success: true,
      message: 'Test lead yetkazildi',
      crmLeadId: result.crmLeadId,
      crmType: result.crmType,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
