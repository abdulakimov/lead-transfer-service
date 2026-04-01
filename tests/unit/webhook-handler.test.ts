import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHmac } from 'node:crypto';
import express from 'express';

const TEST_SECRET = 'test_fb_app_secret';
const TEST_VERIFY_TOKEN = 'test_verify_token';

// Mock env
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({}),
  getEnv: () => ({
    FB_APP_SECRET: TEST_SECRET,
    FB_VERIFY_TOKEN: TEST_VERIFY_TOKEN,
    DATABASE_URL: 'postgresql://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
  }),
}));

// Mock DB
vi.mock('../../src/db/pool.js', () => ({
  getPool: () => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

// Mock queue
vi.mock('../../src/queue/lead-queue.js', () => ({
  addLeadJob: vi.fn().mockResolvedValue('job-1'),
}));

const { default: facebookWebhook } = await import('../../src/webhooks/facebook.js');

function createApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));
  app.use('/api/facebook', facebookWebhook);
  return app;
}

async function request(app: express.Express, method: 'get' | 'post', path: string, options: {
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
} = {}) {
  // Use a simple approach: create a test via node http
  const { default: http } = await import('node:http');
  const server = http.createServer(app);

  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('No address'));
        return;
      }

      const queryStr = options.query
        ? '?' + new URLSearchParams(options.query).toString()
        : '';

      const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
      const reqOptions = {
        hostname: '127.0.0.1',
        port: addr.port,
        path: path + queryStr,
        method: method.toUpperCase(),
        headers: {
          ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...options.headers,
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          let parsed: unknown;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode!, body: parsed });
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

describe('Facebook webhook handler', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/facebook/webhook (verification)', () => {
    it('should respond with challenge on canonical path', async () => {
      const res = await request(app, 'get', '/api/facebook', {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': TEST_VERIFY_TOKEN,
          'hub.challenge': 'challenge_root',
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('challenge_root');
    });

    it('should respond with challenge on valid verify token', async () => {
      const res = await request(app, 'get', '/api/facebook/webhook', {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': TEST_VERIFY_TOKEN,
          'hub.challenge': 'challenge_123',
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('challenge_123');
    });

    it('should return 403 on invalid verify token', async () => {
      const res = await request(app, 'get', '/api/facebook/webhook', {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'challenge_123',
        },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/facebook/webhook (receive leads)', () => {
    it('should return 200 with valid signature on canonical path', async () => {
      const body = { object: 'page', entry: [] };
      const bodyStr = JSON.stringify(body);
      const signature = 'sha256=' + createHmac('sha256', TEST_SECRET)
        .update(bodyStr)
        .digest('hex');

      const res = await request(app, 'post', '/api/facebook', {
        body,
        headers: { 'x-hub-signature-256': signature },
      });
      expect(res.status).toBe(200);
    });

    it('should return 401 without signature', async () => {
      const res = await request(app, 'post', '/api/facebook/webhook', {
        body: { object: 'page', entry: [] },
      });
      expect(res.status).toBe(401);
    });

    it('should return 401 with wrong signature', async () => {
      const res = await request(app, 'post', '/api/facebook/webhook', {
        body: { object: 'page', entry: [] },
        headers: { 'x-hub-signature-256': 'sha256=invalid' },
      });
      expect(res.status).toBe(401);
    });

    it('should return 200 with valid signature', async () => {
      const body = { object: 'page', entry: [] };
      const bodyStr = JSON.stringify(body);
      const signature = 'sha256=' + createHmac('sha256', TEST_SECRET)
        .update(bodyStr)
        .digest('hex');

      const res = await request(app, 'post', '/api/facebook/webhook', {
        body,
        headers: { 'x-hub-signature-256': signature },
      });
      expect(res.status).toBe(200);
    });
  });
});
