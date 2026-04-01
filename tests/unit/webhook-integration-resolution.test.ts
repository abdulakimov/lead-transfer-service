import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createHmac } from 'node:crypto';
import { testRequest } from '../helpers/http.js';

const TEST_SECRET = 'test_fb_app_secret';
const TEST_VERIFY_TOKEN = 'test_verify_token';

const mockQuery = vi.fn();
const addLeadJobMock = vi.fn();

vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({}),
  getEnv: () => ({
    FB_APP_SECRET: TEST_SECRET,
    FB_VERIFY_TOKEN: TEST_VERIFY_TOKEN,
    DATABASE_URL: 'postgresql://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
  }),
}));

vi.mock('../../src/db/pool.js', () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}));

vi.mock('../../src/queue/lead-queue.js', () => ({
  addLeadJob: addLeadJobMock,
}));

const { default: facebookWebhook } = await import('../../src/webhooks/facebook.js');
const { LEAD_STATUS } = await import('../../src/config/constants.js');

function createApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use('/webhooks/facebook', facebookWebhook);
  return app;
}

function sign(payload: unknown): string {
  return 'sha256=' + createHmac('sha256', TEST_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function payload(formId?: string) {
  return {
    object: 'page',
    entry: [
      {
        id: '1056259887566576',
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: 'lead-1',
              form_id: formId,
              ad_id: 'ad-1',
              created_time: 1774682797,
            },
          },
        ],
      },
    ],
  };
}

describe('Facebook webhook integration resolution precedence', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    addLeadJobMock.mockReset();
  });

  it('uses exact page+form integration when form_id exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'integration-exact' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    addLeadJobMock.mockResolvedValue('job-1');

    const app = createApp();
    const body = payload('FORM_MATCH_E2E');
    const res = await testRequest(app, 'POST', '/webhooks/facebook', {
      body,
      headers: { 'x-hub-signature-256': sign(body) },
    });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHEN $2::text IS NOT NULL AND source_form_id = $2 THEN 0'),
      ['1056259887566576', 'FORM_MATCH_E2E'],
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO leads'),
      ['integration-exact', 'lead-1', '1056259887566576', LEAD_STATUS.PENDING],
    );
    expect(addLeadJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-exact',
        formId: 'FORM_MATCH_E2E',
        pageId: '1056259887566576',
      }),
    );
  });

  it('falls back to page-level integration when exact form integration is absent', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'integration-page-fallback' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    addLeadJobMock.mockResolvedValue('job-1');

    const app = createApp();
    const body = payload('UNCONFIGURED_FORM');
    const res = await testRequest(app, 'POST', '/webhooks/facebook', {
      body,
      headers: { 'x-hub-signature-256': sign(body) },
    });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('source_form_id = $2 OR source_form_id IS NULL'),
      ['1056259887566576', 'UNCONFIGURED_FORM'],
    );
    expect(addLeadJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-page-fallback',
      }),
    );
  });

  it('prefers page-level integration when webhook payload has no form_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'integration-page-only' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    addLeadJobMock.mockResolvedValue('job-1');

    const app = createApp();
    const body = payload(undefined);
    const res = await testRequest(app, 'POST', '/webhooks/facebook', {
      body,
      headers: { 'x-hub-signature-256': sign(body) },
    });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHEN source_form_id IS NULL THEN 1'),
      ['1056259887566576', null],
    );
    expect(addLeadJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-page-only',
        formId: undefined,
      }),
    );
  });
});
