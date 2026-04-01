import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { getEnv } from '../config/env.js';
import { getPool } from '../db/pool.js';

const SALT_ROUNDS = 12;

// ── Password ──

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── JWT ──

export interface TokenPayload {
  userId: string;
  email: string;
}

function parseExpiry(value: string): number {
  const match = value.match(/^(\d+)([dhms])$/);
  if (!match) return 900; // default 15m
  const [, amount, unit] = match;
  const multipliers: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  return parseInt(amount) * (multipliers[unit] ?? 60);
}

export function signAccessToken(payload: TokenPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: parseExpiry(env.JWT_EXPIRES_IN) });
}

export function verifyAccessToken(token: string): TokenPayload {
  const env = getEnv();
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

// ── Refresh tokens ──

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  const env = getEnv();

  // Parse refresh expiry (e.g. "30d" → 30 days)
  const match = env.JWT_REFRESH_EXPIRES_IN.match(/^(\d+)([dhms])$/);
  if (!match) throw new Error('JWT_REFRESH_EXPIRES_IN formati noto\'g\'ri');

  const [, amount, unit] = match;
  const multipliers: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  const seconds = parseInt(amount) * (multipliers[unit] ?? 86400);
  const expiresAt = new Date(Date.now() + seconds * 1000);

  const pool = getPool();
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return token;
}

export async function verifyRefreshToken(token: string): Promise<{ userId: string }> {
  const tokenHash = hashToken(token);
  const pool = getPool();

  const result = await pool.query(
    `SELECT user_id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()`,
    [tokenHash],
  );

  if (result.rows.length === 0) {
    throw new Error('Refresh token yaroqsiz yoki muddati tugagan');
  }

  return { userId: result.rows[0].user_id };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const pool = getPool();

  await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
    [tokenHash],
  );
}

export async function revokeAllRefreshTokens(userId: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
    [userId],
  );
  return result.rowCount ?? 0;
}

// ── User CRUD ──

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  telegram_chat_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createUser(email: string, password: string, name: string): Promise<UserRow> {
  const pool = getPool();
  const passwordHash = await hashPassword(password);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, passwordHash, name],
  );

  return result.rows[0];
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const pool = getPool();
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const pool = getPool();
  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}
