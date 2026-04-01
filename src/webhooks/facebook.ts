import { Router, type Request, type Response } from 'express';
import { getEnv } from '../config/env.js';
import { verifyFacebookSignature } from '../middleware/webhook-verify.js';
import { getPool } from '../db/pool.js';
import { addLeadJob } from '../queue/lead-queue.js';
import { LEAD_STATUS } from '../config/constants.js';
import { formatErrorForLog } from '../utils/log-sanitize.js';

const router = Router();

function warnIfLegacyPath(path: string) {
  if (path === '/webhook') {
    // eslint-disable-next-line no-console
    console.warn('[facebook:webhook] legacy path ishlatildi: /webhook (kanonik: /)');
  }
}

// Facebook verification challenge
function handleVerification(req: Request, res: Response) {
  warnIfLegacyPath(req.path);
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === getEnv().FB_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Tekshirish muvaffaqiyatsiz' });
}

// Receive lead webhook
async function handleLeadWebhook(req: Request, res: Response) {
  warnIfLegacyPath(req.path);
  // Return 200 immediately; process async
  res.status(200).json({ status: 'qabul qilindi' });

  try {
    const body = req.body;
    if (body.object !== 'page') return;

    const pool = getPool();

    for (const entry of body.entry ?? []) {
      const pageId: string = entry.id;

      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;

        const leadgenId: string = change.value.leadgen_id;
        const adId: string | undefined = change.value.ad_id;
        const formId: string | undefined = change.value.form_id;
        const createdTime: number | undefined = change.value.created_time;
        // eslint-disable-next-line no-console
        console.log(
          `[facebook:webhook] qabul qilindi page_id=${pageId} form_id=${formId ?? 'null'} leadgen_id=${leadgenId}`,
        );

        // Find integration for this page/form.
        // Prefer exact form match when form_id is provided, then fallback to page-level integration.
        const intResult = await pool.query(
          `SELECT id, user_id
           FROM integrations
           WHERE source_page_id = $1
             AND active = true
             AND ($2::text IS NULL OR source_form_id = $2 OR source_form_id IS NULL)
           ORDER BY
             CASE
               WHEN $2::text IS NOT NULL AND source_form_id = $2 THEN 0
               WHEN source_form_id IS NULL THEN 1
               ELSE 2
             END,
             updated_at DESC
           LIMIT 20`,
          [pageId, formId ?? null],
        );

        if (intResult.rows.length === 0) {
          // eslint-disable-next-line no-console
          console.warn(`Sahifa ${pageId} uchun integratsiya topilmadi`);
          continue;
        }

        const uniqueUsers = new Set(intResult.rows.map((row) => String(row.user_id)));
        if (uniqueUsers.size > 1) {
          // eslint-disable-next-line no-console
          console.warn(
            `[facebook:webhook] ambiguous integration: page_id=${pageId} form_id=${formId ?? 'null'} users=${uniqueUsers.size}. Lead skip qilindi.`,
          );
          continue;
        }

        const integrationId = intResult.rows[0].id as string;
        // eslint-disable-next-line no-console
        console.log(
          `[facebook:webhook] mos integratsiya topildi integration_id=${integrationId} page_id=${pageId}`,
        );

        // Insert lead record idempotently. If it already exists, skip queueing.
        const insertResult = await pool.query(
          `INSERT INTO leads (integration_id, leadgen_id, fb_page_id, status)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (leadgen_id) DO NOTHING`,
          [integrationId, leadgenId, pageId, LEAD_STATUS.PENDING],
        );
        if (insertResult.rowCount === 0) {
          // eslint-disable-next-line no-console
          console.log(`[facebook:webhook] dublikat event skip qilindi leadgen_id=${leadgenId}`);
          continue;
        }

        // Enqueue for processing
        await addLeadJob({ leadgenId, pageId, integrationId, adId, formId, createdTime });

        // eslint-disable-next-line no-console
        console.log(`Lead ${leadgenId} navbatga qo'shildi`);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Webhook qayta ishlashda xato: ${formatErrorForLog(err)}`);
  }
}

// Support both legacy `/` and `/webhook` route shapes.
router.get('/', handleVerification);
router.get('/webhook', handleVerification);
router.post('/', verifyFacebookSignature, handleLeadWebhook);
router.post('/webhook', verifyFacebookSignature, handleLeadWebhook);

export default router;
