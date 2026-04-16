import { z } from 'zod';

const REQUIRED_FB_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'business_management',
  'pages_manage_ads',
] as const;

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),

  FB_APP_ID: z.string().min(1),
  FB_APP_SECRET: z.string().min(1),
  FB_VERIFY_TOKEN: z.string().min(1),
  FB_OAUTH_SCOPES: z.string().default('public_profile,pages_show_list,pages_read_engagement,pages_manage_metadata,business_management,pages_manage_ads'),
  FB_OAUTH_CONFIG_ID: z.string().optional().default(''),
  FB_OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/integrations/facebook/oauth/callback'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/integrations/google/oauth/callback'),
  AUTH_GOOGLE_OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/auth/google/callback'),

  ENCRYPTION_KEY: z.string().min(32),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  TELEGRAM_BOT_TOKEN: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Muhit o'zgaruvchilari xatosi:\n${formatted}`);
  }

  _env = result.data;

  if (_env.NODE_ENV === 'production') {
    if (!_env.FB_OAUTH_CONFIG_ID.trim()) {
      throw new Error('Muhit o\'zgaruvchilari xatosi:\n  FB_OAUTH_CONFIG_ID: productionda bo\'sh bo\'lishi mumkin emas');
    }

    const scopeSet = new Set(
      _env.FB_OAUTH_SCOPES
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const missingScopes = REQUIRED_FB_SCOPES.filter((scope) => !scopeSet.has(scope));
    if (missingScopes.length > 0) {
      throw new Error(
        `Muhit o'zgaruvchilari xatosi:\n  FB_OAUTH_SCOPES: required scope yetishmaydi -> ${missingScopes.join(', ')}`,
      );
    }

    if (!_env.FB_OAUTH_REDIRECT_URI.startsWith('https://')) {
      throw new Error('Muhit o\'zgaruvchilari xatosi:\n  FB_OAUTH_REDIRECT_URI: productionda https bo\'lishi shart');
    }
  }

  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error('loadEnv() chaqirilmagan');
  return _env;
}

