import { Redis } from 'ioredis';
import { getEnv } from '../config/env.js';
import { decrypt } from '../config/encryption.js';
import { getPool } from '../db/pool.js';
import { getCrmAdapter } from './crm-adapter.js';

export type PreflightCheckStatus = 'pass' | 'warn' | 'fail';
export type PreflightOverallStatus = 'ready' | 'partial' | 'failed';
export type PreflightSeverity = 'info' | 'warning' | 'critical';

export interface PreflightCheck {
  // Operator-friendly fields
  key: string;
  status: PreflightCheckStatus;
  message: string;
  severity: PreflightSeverity;
  suggested_action?: string;
  // Backward-compatible aliases
  id: string;
  action?: string;
}

export interface PreflightResult {
  // Operator-friendly fields
  overall_status: PreflightOverallStatus;
  summary: string;
  next_step: string;
  // Backward-compatible aliases
  status: PreflightOverallStatus;
  recommended_next_step: string;
  integration_id: string;
  source_type: string;
  dest_type: string;
  checks: PreflightCheck[];
  actionable_errors: string[];
}

interface IntegrationConfigRow {
  id: string;
  active: boolean;
  source_type: string;
  source_page_id: string | null;
  source_page_access_token: string | null;
  source_form_id: string | null;
  dest_type: string;
  dest_credentials: string | null;
}

export async function runIntegrationPreflight(row: IntegrationConfigRow): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  const actionableErrors: string[] = [];

  const addCheck = (check: PreflightCheck) => {
    checks.push(check);
    if (check.status === 'fail' && check.suggested_action) {
      actionableErrors.push(check.suggested_action);
    }
  };

  addCheck(checkIntegrationEnabled(row));
  addCheck(checkSourceFields(row));

  const sourceTokenCheck = row.source_type === 'google_forms'
    ? {
      check: makeCheck('secrets.source_page_access_token', 'pass', 'Google Forms source token talab qilinmaydi', 'info'),
      decrypted: null,
    }
    : checkEncryptedField(
      row.source_page_access_token,
      'source_page_access_token',
      'Facebook sahifa access tokenini qayta saqlang',
    );
  addCheck(sourceTokenCheck.check);

  const destCredsCheck = checkEncryptedField(
    row.dest_credentials,
    'dest_credentials',
    'CRM credentials ni qayta saqlang',
  );
  addCheck(destCredsCheck.check);

  addCheck(checkPageFormCoherence(row));
  addCheck(checkWebhookEnv(row));
  addCheck(await checkDatabaseReachability());
  addCheck(await checkRedisReachability());
  addCheck(await checkCrmAdapterReadiness(row, destCredsCheck.decrypted));

  const overallStatus = computeOverallStatus(checks);
  const nextStep = recommendNextStep(overallStatus, checks);

  return {
    overall_status: overallStatus,
    summary: buildSummary(overallStatus, checks),
    next_step: nextStep,
    status: overallStatus,
    recommended_next_step: nextStep,
    integration_id: row.id,
    source_type: row.source_type,
    dest_type: row.dest_type,
    checks,
    actionable_errors: actionableErrors,
  };
}

function checkIntegrationEnabled(row: IntegrationConfigRow): PreflightCheck {
  if (!row.active) {
    return makeCheck(
      'integration.active',
      'fail',
      'Integratsiya o\'chirilgan (active=false)',
      'critical',
      'Go-live oldidan integratsiyani yoqing (`POST /api/integrations/:id/toggle`)',
    );
  }

  return makeCheck('integration.active', 'pass', 'Integratsiya yoqilgan', 'info');
}

function checkSourceFields(row: IntegrationConfigRow): PreflightCheck {
  if (row.source_type === 'google_forms') {
    if (!row.source_form_id) {
      return makeCheck(
        'source.form_id',
        'fail',
        'Google Forms source uchun source_form_id kiritilmagan',
        'critical',
        'Google Form ID ni integratsiyaga kiriting',
      );
    }
    return makeCheck('source.form_id', 'pass', 'Google Form ID mavjud', 'info');
  }

  if (!row.source_page_id) {
    return makeCheck(
      'source.page_id',
      'fail',
      'source_page_id kiritilmagan',
      'critical',
      'Facebook sahifa ID ni integratsiyaga kiriting',
    );
  }

  return makeCheck('source.page_id', 'pass', 'source_page_id mavjud', 'info');
}

function checkEncryptedField(
  encryptedValue: string | null,
  fieldName: string,
  suggestedAction: string,
): { check: PreflightCheck; decrypted: string | null } {
  if (!encryptedValue) {
    return {
      check: makeCheck(`secrets.${fieldName}`, 'fail', `${fieldName} saqlanmagan`, 'critical', suggestedAction),
      decrypted: null,
    };
  }

  try {
    const decrypted = decrypt(encryptedValue);
    if (!decrypted) {
      return {
        check: makeCheck(`secrets.${fieldName}`, 'fail', `${fieldName} bo'sh`, 'critical', suggestedAction),
        decrypted: null,
      };
    }

    return {
      check: makeCheck(`secrets.${fieldName}`, 'pass', `${fieldName} shifrdan yechildi`, 'info'),
      decrypted,
    };
  } catch {
    return {
      check: makeCheck(`secrets.${fieldName}`, 'fail', `${fieldName} shifrdan yechilmadi`, 'critical', suggestedAction),
      decrypted: null,
    };
  }
}

function checkPageFormCoherence(row: IntegrationConfigRow): PreflightCheck {
  if (row.source_type === 'google_forms') {
    if (!row.source_form_id) {
      return makeCheck(
        'source.form_coherence',
        'fail',
        'Google Forms source uchun form_id topilmadi',
        'critical',
        'source_form_id ni kiriting',
      );
    }
    return makeCheck('source.form_coherence', 'pass', 'Google Forms manba sozlamasi mos', 'info');
  }

  if (row.source_form_id && !row.source_page_id) {
    return makeCheck(
      'source.form_coherence',
      'fail',
      'source_form_id bor, lekin source_page_id yo\'q',
      'critical',
      'Form ishlatish uchun source_page_id ni ham kiriting',
    );
  }

  if (!row.source_form_id) {
    return makeCheck(
      'source.form_coherence',
      'warn',
      'source_form_id kiritilmagan, sahifa darajasida fallback ishlatiladi',
      'warning',
      'Agar aniq form kerak bo\'lsa, source_form_id ni kiriting',
    );
  }

  return makeCheck('source.form_coherence', 'pass', 'source_page_id + source_form_id mos', 'info');
}

function checkWebhookEnv(row: IntegrationConfigRow): PreflightCheck {
  if (row.source_type === 'google_forms') {
    return makeCheck('env.webhook', 'pass', 'Google Forms webhook env maxsus talab qilinmaydi', 'info');
  }
  const env = getEnv();
  if (!env.FB_VERIFY_TOKEN || !env.FB_APP_SECRET) {
    return makeCheck(
      'env.webhook',
      'fail',
      'FB webhook env qiymatlari to\'liq emas',
      'critical',
      'FB_VERIFY_TOKEN va FB_APP_SECRET ni tekshiring',
    );
  }

  return makeCheck('env.webhook', 'pass', 'FB webhook env qiymatlari mavjud', 'info');
}

async function checkDatabaseReachability(): Promise<PreflightCheck> {
  try {
    await getPool().query('SELECT 1');
    return makeCheck('deps.postgres', 'pass', 'PostgreSQL ulanishi mavjud', 'info');
  } catch (err) {
    return makeCheck(
      'deps.postgres',
      'fail',
      `PostgreSQL ulanish xatosi: ${getErrorMessage(err)}`,
      'critical',
      'DATABASE_URL va DB xizmatini tekshiring',
    );
  }
}

async function checkRedisReachability(): Promise<PreflightCheck> {
  const client = new Redis(getEnv().REDIS_URL);
  try {
    const pong = await client.ping();
    if (pong !== 'PONG') {
      return makeCheck(
        'deps.redis',
        'fail',
        `Redis kutilmagan javob: ${pong}`,
        'critical',
        'REDIS_URL va Redis xizmatini tekshiring',
      );
    }
    return makeCheck('deps.redis', 'pass', 'Redis ulanishi mavjud', 'info');
  } catch (err) {
    return makeCheck(
      'deps.redis',
      'fail',
      `Redis ulanish xatosi: ${getErrorMessage(err)}`,
      'critical',
      'REDIS_URL va Redis xizmatini tekshiring',
    );
  } finally {
    client.disconnect();
  }
}

async function checkCrmAdapterReadiness(
  row: IntegrationConfigRow,
  decryptedDestCredentials: string | null,
): Promise<PreflightCheck> {
  if (!decryptedDestCredentials) {
    return makeCheck(
      'dest.adapter',
      'fail',
      'CRM adapter tekshirilmadi (credentials yo\'q)',
      'critical',
      'dest_credentials ni to\'ldirib qayta preflight qiling',
    );
  }

  try {
    await getCrmAdapter(row.dest_type, decryptedDestCredentials);
    return makeCheck('dest.adapter', 'pass', `CRM adapter tayyor (${row.dest_type})`, 'info');
  } catch (err) {
    return makeCheck(
      'dest.adapter',
      'fail',
      `CRM adapter xatosi: ${getErrorMessage(err)}`,
      'critical',
      'dest_type va credentials formatini tekshiring',
    );
  }
}

function computeOverallStatus(checks: PreflightCheck[]): PreflightOverallStatus {
  const hasFail = checks.some((c) => c.status === 'fail');
  if (hasFail) return 'failed';
  const hasWarn = checks.some((c) => c.status === 'warn');
  return hasWarn ? 'partial' : 'ready';
}

function recommendNextStep(status: PreflightOverallStatus, checks: PreflightCheck[]): string {
  if (status === 'ready') {
    return 'Webhook verification ni Meta bilan tekshirib, test lead yuboring';
  }

  const firstFail = checks.find((c) => c.status === 'fail');
  if (firstFail?.suggested_action) {
    return firstFail.suggested_action;
  }

  return 'Warn/fail checklarni bartaraf etib preflight ni qayta ishga tushiring';
}

function buildSummary(status: PreflightOverallStatus, checks: PreflightCheck[]): string {
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  return `Preflight ${status}: pass=${passCount}, warn=${warnCount}, fail=${failCount}`;
}

function makeCheck(
  key: string,
  status: PreflightCheckStatus,
  message: string,
  severity: PreflightSeverity,
  suggestedAction?: string,
): PreflightCheck {
  return {
    key,
    id: key,
    status,
    message,
    severity,
    suggested_action: suggestedAction,
    action: suggestedAction,
  };
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'noma\'lum xato';
}
