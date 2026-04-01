import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('env validation', () => {
  const envBoolean = z.preprocess((input) => {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'number') return input === 1;
    if (typeof input !== 'string') return input;
    const normalized = input.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return input;
  }, z.boolean());

  // Test the schema logic directly without importing the singleton
  const envSchema = z.object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string(),
    FB_APP_ID: z.string().min(1),
    FB_APP_SECRET: z.string().min(1),
    FB_VERIFY_TOKEN: z.string().min(1),
    ENCRYPTION_KEY: z.string().min(32),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    TELEGRAM_BOT_TOKEN: z.string().default(''),
    TRACKING_ENABLED: envBoolean.default(false),
  });

  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    FB_APP_ID: '123456',
    FB_APP_SECRET: 'secret123',
    FB_VERIFY_TOKEN: 'verify_me',
    ENCRYPTION_KEY: 'a'.repeat(32),
    JWT_SECRET: 'jwt_secret_16chars',
  };

  it('should parse valid env with defaults', () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.JWT_EXPIRES_IN).toBe('15m');
    }
  });

  it('should reject missing DATABASE_URL', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { DATABASE_URL: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject short ENCRYPTION_KEY', () => {
    const result = envSchema.safeParse({ ...validEnv, ENCRYPTION_KEY: 'short' });
    expect(result.success).toBe(false);
  });

  it('should reject short JWT_SECRET', () => {
    const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: 'short' });
    expect(result.success).toBe(false);
  });

  it('should coerce PORT to number', () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: '8080' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
    }
  });

  it('should reject invalid NODE_ENV', () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'staging' });
    expect(result.success).toBe(false);
  });

  it('should parse TRACKING_ENABLED=false as false', () => {
    const result = envSchema.safeParse({ ...validEnv, TRACKING_ENABLED: 'false' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TRACKING_ENABLED).toBe(false);
    }
  });

  it('should parse TRACKING_ENABLED=true as true', () => {
    const result = envSchema.safeParse({ ...validEnv, TRACKING_ENABLED: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TRACKING_ENABLED).toBe(true);
    }
  });
});
