import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { decrypt } from '../config/encryption.js';
import { addLeadJob } from '../queue/lead-queue.js';
import { LEAD_STATUS } from '../config/constants.js';
import { formatErrorForLog } from '../utils/log-sanitize.js';

const router = Router();

const payloadSchema = z.object({
  form_id: z.string().trim().optional(),
  formId: z.string().trim().optional(),
  response_id: z.string().trim().optional(),
  responseId: z.string().trim().optional(),
  submitted_at: z.string().trim().optional(),
  submittedAt: z.string().trim().optional(),
  answers: z.record(z.unknown()).optional(),
  fields: z.record(z.unknown()).optional(),
}).passthrough();

function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.post('/', async (req, res) => {
  res.status(200).json({ status: 'qabul qilindi' });

  try {
    const body = payloadSchema.parse(req.body ?? {});
    const formId = body.form_id || body.formId || '';
    if (!formId) {
      // eslint-disable-next-line no-console
      console.warn('[google-forms:webhook] form_id yoq, event skip qilindi');
      return;
    }

    const explicitResponseId = body.response_id || body.responseId || '';
    const leadgenId = explicitResponseId
      || `gform-${createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 24)}`;

    const pool = getPool();
    const intResult = await pool.query(
      `SELECT id, source_page_access_token
       FROM integrations
       WHERE source_type = 'google_forms'
         AND source_form_id = $1
         AND active = true
       ORDER BY updated_at DESC
       LIMIT 1`,
      [formId],
    );

    if (intResult.rows.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(`[google-forms:webhook] form uchun integratsiya topilmadi form_id=${formId}`);
      return;
    }

    const integrationId = String(intResult.rows[0].id);
    const encryptedToken = intResult.rows[0].source_page_access_token as string | null;
    const receivedToken = String(req.header('x-webhook-token') ?? '');

    if (encryptedToken) {
      const expectedToken = decrypt(encryptedToken);
      if (!receivedToken || !safeEquals(receivedToken, expectedToken)) {
        // eslint-disable-next-line no-console
        console.warn(`[google-forms:webhook] token xato integration_id=${integrationId} form_id=${formId}`);
        return;
      }
    }

    const insertResult = await pool.query(
      `INSERT INTO leads (integration_id, leadgen_id, fb_page_id, raw_data, status)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (leadgen_id) DO NOTHING`,
      [integrationId, leadgenId, formId, JSON.stringify(body), LEAD_STATUS.PENDING],
    );

    if (insertResult.rowCount === 0) {
      // eslint-disable-next-line no-console
      console.log(`[google-forms:webhook] dublikat event skip qilindi leadgen_id=${leadgenId}`);
      return;
    }

    await addLeadJob({
      leadgenId,
      integrationId,
      pageId: formId,
      formId,
      sourceType: 'google_forms',
      sourcePayload: body as Record<string, unknown>,
    });

    // eslint-disable-next-line no-console
    console.log(`[google-forms:webhook] navbatga qo'shildi integration_id=${integrationId} form_id=${formId} leadgen_id=${leadgenId}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[google-forms:webhook] xato: ${formatErrorForLog(err)}`);
  }
});

export default router;
