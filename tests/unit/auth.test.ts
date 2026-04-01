import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { testRequest } from '../helpers/http.js';

// ── In-memory stores for mock DB ──

let users: Array<{
  id: string;
  email: string;
  name: string;
  password_hash: string;
  telegram_chat_id: string | null;
  created_at: Date;
  updated_at: Date;
}> = [];

let refreshTokens: Array<{
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
}> = [];

let idCounter = 0;

function resetStores() {
  users = [];
  refreshTokens = [];
  idCounter = 0;
}

// ── Mock pool.query ──

const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  const q = sql.trim().replace(/\s+/g, ' ');

  // INSERT INTO users
  if (q.startsWith('INSERT INTO users')) {
    const [email, passwordHash, name] = params as string[];
    const existing = users.find((u) => u.email === email);
    if (existing) {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    }
    const user = {
      id: `user-${++idCounter}`,
      email,
      password_hash: passwordHash,
      name,
      telegram_chat_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    users.push(user);
    return { rows: [user] };
  }

  // SELECT * FROM users WHERE email
  if (q.includes('FROM users WHERE email')) {
    const email = (params as string[])[0];
    const user = users.find((u) => u.email === email);
    return { rows: user ? [user] : [] };
  }

  // SELECT * FROM users WHERE id
  if (q.includes('FROM users WHERE id')) {
    const id = (params as string[])[0];
    const user = users.find((u) => u.id === id);
    return { rows: user ? [user] : [] };
  }

  // INSERT INTO refresh_tokens
  if (q.startsWith('INSERT INTO refresh_tokens')) {
    const [userId, tokenHash, expiresAt] = params as [string, string, Date];
    refreshTokens.push({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked: false });
    return { rows: [] };
  }

  // SELECT from refresh_tokens (verify)
  if (q.includes('FROM refresh_tokens') && q.includes('SELECT')) {
    const tokenHash = (params as string[])[0];
    const rt = refreshTokens.find(
      (t) => t.token_hash === tokenHash && !t.revoked && t.expires_at > new Date(),
    );
    return { rows: rt ? [{ user_id: rt.user_id }] : [] };
  }

  // UPDATE refresh_tokens (revoke all for user)
  if (q.startsWith('UPDATE refresh_tokens') && q.includes('user_id')) {
    const userId = (params as string[])[0];
    let count = 0;
    for (const t of refreshTokens) {
      if (t.user_id === userId && !t.revoked) { t.revoked = true; count++; }
    }
    return { rows: [], rowCount: count };
  }

  // UPDATE refresh_tokens (revoke single)
  if (q.startsWith('UPDATE refresh_tokens')) {
    const tokenHash = (params as string[])[0];
    const rt = refreshTokens.find((t) => t.token_hash === tokenHash);
    if (rt) rt.revoked = true;
    return { rows: [] };
  }

  return { rows: [] };
});

vi.mock('../../src/db/pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({}),
  getEnv: () => ({
    JWT_SECRET: 'test_jwt_secret_minimum_16',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    DATABASE_URL: 'postgresql://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    FB_APP_SECRET: 'test',
    FB_VERIFY_TOKEN: 'test',
    ENCRYPTION_KEY: 'a'.repeat(64),
  }),
}));

const { default: authRoutes } = await import('../../src/api/auth.js');
const { errorHandler } = await import('../../src/middleware/error-handler.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

describe('Auth API', () => {
  let app: express.Express;

  beforeEach(() => {
    resetStores();
    mockQuery.mockClear();
    app = createApp();
  });

  // ── Register ──

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'test@example.com', password: 'password123', name: 'Test User' },
      });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect((res.body.user as Record<string, unknown>).email).toBe('test@example.com');
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'dup@example.com', password: 'password123', name: 'User 1' },
      });

      const res = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'dup@example.com', password: 'password456', name: 'User 2' },
      });

      expect(res.status).toBe(409);
    });

    it('should reject short password', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'test@example.com', password: 'short', name: 'Test' },
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'not-an-email', password: 'password123', name: 'Test' },
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing name', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'test@example.com', password: 'password123' },
      });

      expect(res.status).toBe(400);
    });
  });

  // ── Login ──

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'user@example.com', password: 'password123', name: 'Test User' },
      });
    });

    it('should login with correct credentials', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/login', {
        body: { email: 'user@example.com', password: 'password123' },
      });

      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      expect((res.body.user as Record<string, unknown>).email).toBe('user@example.com');
    });

    it('should reject wrong password', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/login', {
        body: { email: 'user@example.com', password: 'wrongpassword' },
      });

      expect(res.status).toBe(401);
    });

    it('should reject non-existent email', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/login', {
        body: { email: 'nobody@example.com', password: 'password123' },
      });

      expect(res.status).toBe(401);
    });
  });

  // ── Refresh ──

  describe('POST /api/auth/refresh', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const registerRes = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'user@example.com', password: 'password123', name: 'Test' },
      });

      const refreshToken = registerRes.body.refresh_token as string;

      const res = await testRequest(app, 'POST', '/api/auth/refresh', {
        body: { refresh_token: refreshToken },
      });

      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      // New refresh token should be different (rotation)
      expect(res.body.refresh_token).not.toBe(refreshToken);
    });

    it('should reject revoked refresh token (used twice)', async () => {
      const registerRes = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'user@example.com', password: 'password123', name: 'Test' },
      });

      const refreshToken = registerRes.body.refresh_token as string;

      // First use — should work
      await testRequest(app, 'POST', '/api/auth/refresh', {
        body: { refresh_token: refreshToken },
      });

      // Second use — should fail (token was rotated/revoked)
      const res = await testRequest(app, 'POST', '/api/auth/refresh', {
        body: { refresh_token: refreshToken },
      });

      expect(res.status).toBe(401);
    });

    it('should reject invalid refresh token', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/refresh', {
        body: { refresh_token: 'invalid_token_here' },
      });

      expect(res.status).toBe(401);
    });
  });

  // ── Logout ──

  describe('POST /api/auth/logout', () => {
    it('should revoke refresh token on logout', async () => {
      const registerRes = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'user@example.com', password: 'password123', name: 'Test' },
      });

      const accessToken = registerRes.body.access_token as string;
      const refreshToken = registerRes.body.refresh_token as string;

      const res = await testRequest(app, 'POST', '/api/auth/logout', {
        body: { refresh_token: refreshToken },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);

      // Refresh token should no longer work
      const refreshRes = await testRequest(app, 'POST', '/api/auth/refresh', {
        body: { refresh_token: refreshToken },
      });

      expect(refreshRes.status).toBe(401);
    });

    it('should reject logout without auth token', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/logout', {
        body: { refresh_token: 'some_token' },
      });

      expect(res.status).toBe(401);
    });
  });

  // ── Logout All ──

  describe('POST /api/auth/logout-all', () => {
    it('should revoke all refresh tokens for user', async () => {
      // Register and login twice to create multiple refresh tokens
      const registerRes = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'user@example.com', password: 'password123', name: 'Test' },
      });
      const accessToken = registerRes.body.access_token as string;
      const refreshToken1 = registerRes.body.refresh_token as string;

      const loginRes = await testRequest(app, 'POST', '/api/auth/login', {
        body: { email: 'user@example.com', password: 'password123' },
      });
      const refreshToken2 = loginRes.body.refresh_token as string;

      // Logout all
      const res = await testRequest(app, 'POST', '/api/auth/logout-all', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.body.revoked_count).toBe(2);

      // Both refresh tokens should be invalid now
      const r1 = await testRequest(app, 'POST', '/api/auth/refresh', {
        body: { refresh_token: refreshToken1 },
      });
      expect(r1.status).toBe(401);

      const r2 = await testRequest(app, 'POST', '/api/auth/refresh', {
        body: { refresh_token: refreshToken2 },
      });
      expect(r2.status).toBe(401);
    });

    it('should reject without auth token', async () => {
      const res = await testRequest(app, 'POST', '/api/auth/logout-all');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /me ──

  describe('GET /api/auth/me', () => {
    it('should return current user info', async () => {
      const registerRes = await testRequest(app, 'POST', '/api/auth/register', {
        body: { email: 'user@example.com', password: 'password123', name: 'Test User' },
      });

      const accessToken = registerRes.body.access_token as string;

      const res = await testRequest(app, 'GET', '/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('user@example.com');
      expect(res.body.name).toBe('Test User');
      // Should not expose password_hash
      expect(res.body.password_hash).toBeUndefined();
    });

    it('should reject without token', async () => {
      const res = await testRequest(app, 'GET', '/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject with invalid token', async () => {
      const res = await testRequest(app, 'GET', '/api/auth/me', {
        headers: { Authorization: 'Bearer invalid.token.here' },
      });
      expect(res.status).toBe(401);
    });

    it('should reject with expired token format', async () => {
      const res = await testRequest(app, 'GET', '/api/auth/me', {
        headers: { Authorization: 'InvalidFormat' },
      });
      expect(res.status).toBe(401);
    });
  });
});
