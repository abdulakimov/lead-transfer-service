import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadEnv } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import authRoutes from './api/auth.js';
import integrationsRoutes from './api/integrations.js';
import connectionsRoutes from './api/connections.js';
import leadsRoutes from './api/leads.js';
import workflowsRoutes from './api/workflows.js';
import metaCapiRoutes from './api/meta-capi.js';
import metaPixelRoutes from './api/meta-pixel.js';
import facebookWebhook from './webhooks/facebook.js';
import googleFormsWebhook from './webhooks/google-forms.js';
import { startLeadWorker } from './workers/lead-processor.js';
import { startGoogleFormsPoller } from './workers/google-forms-poller.js';
import { startMetaCapiWorker } from './workers/meta-capi-processor.js';

const env = loadEnv();
const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security headers
app.use(helmet());
app.use(cors());

// Parse JSON and capture raw body for webhook signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use(
  '/api/auth',
  createRateLimiter({ windowMs: 60_000, max: 30, keyPrefix: 'auth' }),
  authRoutes,
);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/workflows', workflowsRoutes);
if (env.TRACKING_ENABLED) {
  app.use('/api/meta-capi', metaCapiRoutes);
  app.use('/api/meta-pixel', metaPixelRoutes);
} else {
  // eslint-disable-next-line no-console
  console.log('[tracking] disabled: meta-capi/meta-pixel API route-lari o\'chirildi');
}
app.use(
  '/webhooks/facebook',
  createRateLimiter({ windowMs: 60_000, max: 300, keyPrefix: 'facebook-webhook' }),
  facebookWebhook,
);
app.use(
  '/webhooks/google-forms',
  createRateLimiter({ windowMs: 60_000, max: 300, keyPrefix: 'google-forms-webhook' }),
  googleFormsWebhook,
);

// Error handler (must be last)
app.use(errorHandler);

// Start server and worker
const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server ${env.PORT} portda ishga tushdi (${env.NODE_ENV})`);
});

const worker = startLeadWorker();
const metaCapiWorker = env.TRACKING_ENABLED ? startMetaCapiWorker() : null;
const googleFormsPoller = startGoogleFormsPoller();

// Graceful shutdown
async function shutdown() {
  // eslint-disable-next-line no-console
  console.log('Server to\'xtatilmoqda...');
  await googleFormsPoller.close();
  if (metaCapiWorker) {
    await metaCapiWorker.close();
  }
  await worker.close();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app };
