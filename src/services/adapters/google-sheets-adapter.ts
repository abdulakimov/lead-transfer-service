import { createSign } from 'node:crypto';
import type { CrmAdapter, CrmDeliveryResult } from '../crm-adapter.js';
import type { NormalizedLead } from '../facebook.js';
import { getEnv } from '../../config/env.js';

interface GoogleSheetsCredentials {
  client_email: string;
  private_key: string;
  spreadsheet_id: string;
  sheet_name?: string;
  columns?: Array<{ source_field: string; column_title: string }>;
}

interface GoogleSheetsOAuthCredentials {
  mode: 'oauth';
  refresh_token: string;
  spreadsheet_id: string;
  sheet_name?: string;
  google_email?: string;
  columns?: Array<{ source_field: string; column_title: string }>;
}

interface GoogleTokenResponse {
  access_token: string;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwt(credentials: GoogleSheetsCredentials): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();

  const key = credentials.private_key.replace(/\\n/g, '\n');
  const signature = signer.sign(key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${signingInput}.${signature}`;
}

async function getGoogleAccessToken(credentials: GoogleSheetsCredentials): Promise<string> {
  const assertion = signJwt(credentials);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = JSON.stringify(payload);
    throw new Error(`Google token olish xatosi (${response.status}): ${details}`);
  }

  return (payload as GoogleTokenResponse).access_token;
}

async function getGoogleAccessTokenByRefreshToken(credentials: GoogleSheetsOAuthCredentials): Promise<string> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: credentials.refresh_token,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = JSON.stringify(payload);
    throw new Error(`Google refresh token xatosi (${response.status}): ${details}`);
  }
  return (payload as GoogleTokenResponse).access_token;
}

function buildMappedObject(lead: NormalizedLead, mapping: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [sourceField, destinationField] of Object.entries(mapping)) {
    const value = lead.rawFields[sourceField];
    if (!value || !destinationField) continue;
    result[destinationField] = value;
  }
  return result;
}

function resolveLeadValue(lead: NormalizedLead, sourceField: string): string {
  const key = sourceField.trim();
  if (!key) return '';

  if (lead.rawFields[key]) return lead.rawFields[key];

  const normalized = key.toLowerCase();
  if (normalized === 'lead_id' || normalized === 'leadgen_id') return lead.id;
  if (normalized === 'page_id') return lead.pageId ?? '';
  if (normalized === 'form_id') return lead.formId ?? '';
  if (normalized === 'full_name' || normalized === 'name') return lead.name ?? '';
  if (normalized === 'phone' || normalized === 'phone_number') return lead.phone ?? '';
  if (normalized === 'email') return lead.email ?? '';
  if (normalized === 'ad_id') return lead.adId ?? '';
  if (normalized === 'ad_name') return lead.adName ?? '';
  if (normalized === 'adset_id') return lead.adSetId ?? '';
  if (normalized === 'adset_name') return lead.adSetName ?? '';
  if (normalized === 'campaign_id') return lead.campaignId ?? '';
  if (normalized === 'campaign_name') return lead.campaignName ?? '';
  if (normalized === 'created_at' || normalized === 'received_at') return lead.createdAt;

  return '';
}

export class GoogleSheetsAdapter implements CrmAdapter {
  private creds: GoogleSheetsCredentials | GoogleSheetsOAuthCredentials;
  private mode: 'service_account' | 'oauth';

  constructor(credentialsJson: string) {
    const parsed = JSON.parse(credentialsJson) as Record<string, unknown>;

    if (parsed.mode === 'oauth') {
      const oauthCreds = parsed as unknown as GoogleSheetsOAuthCredentials;
      if (!oauthCreds.refresh_token || !oauthCreds.spreadsheet_id) {
        throw new Error('Google OAuth credentials noto\'g\'ri: refresh_token, spreadsheet_id kerak');
      }
      this.creds = oauthCreds;
      this.mode = 'oauth';
      return;
    }

    const serviceCreds = parsed as unknown as GoogleSheetsCredentials;
    if (!serviceCreds.client_email || !serviceCreds.private_key || !serviceCreds.spreadsheet_id) {
      throw new Error('Google Sheets credentials noto\'g\'ri: client_email, private_key, spreadsheet_id kerak');
    }
    this.creds = serviceCreds;
    this.mode = 'service_account';
  }

  async deliver(lead: NormalizedLead, fieldMapping: Record<string, string>): Promise<CrmDeliveryResult> {
    const accessToken = this.mode === 'oauth'
      ? await getGoogleAccessTokenByRefreshToken(this.creds as GoogleSheetsOAuthCredentials)
      : await getGoogleAccessToken(this.creds as GoogleSheetsCredentials);

    const spreadsheetId = this.creds.spreadsheet_id;
    const sheetName = this.creds.sheet_name?.trim() || 'Sheet1';
    const columns = this.creds.columns ?? [];

    const mapped = buildMappedObject(lead, fieldMapping);
    const row = columns.length > 0
      ? columns.map((column) => resolveLeadValue(lead, column.source_field))
      : [
        new Date().toISOString(),
        lead.id,
        lead.pageId ?? '',
        lead.formId ?? '',
        lead.name ?? '',
        lead.phone ?? '',
        lead.email ?? '',
        lead.adName ?? '',
        JSON.stringify(lead.rawFields ?? {}),
        JSON.stringify(mapped),
      ];

    const range = encodeURIComponent(`${sheetName}!A1`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [row],
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Google Sheets yozish xatosi (${response.status}): ${JSON.stringify(payload)}`);
    }

    const updatedRange = (payload as { updates?: { updatedRange?: string } }).updates?.updatedRange ?? lead.id;
    return { success: true, crmLeadId: updatedRange, crmType: 'google_sheets' };
  }
}
