import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import {
  createUser,
  findUserByEmail,
  findUserById,
  comparePassword,
  signAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { getEnv } from '../config/env.js';

const router = Router();

// ── Validation schemas ──

const registerSchema = z.object({
  email: z.string().email('Email formati noto\'g\'ri'),
  password: z.string().min(8, 'Parol kamida 8 ta belgidan iborat bo\'lishi kerak'),
  name: z.string().min(1, 'Ism kiritilishi shart'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token taqdim etilmagan'),
});

const googleAuthStateSchema = z.object({
  origin: z.string().optional(),
});

interface GoogleAuthTokenPayload {
  access_token: string;
}

interface GoogleAuthProfile {
  email?: string;
  name?: string;
  id?: string;
  picture?: string;
}

function signGoogleAuthState(payload: { origin?: string }): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: 600 });
}

function verifyGoogleAuthState(token: string): { origin?: string } {
  const env = getEnv();
  const parsed = jwt.verify(token, env.JWT_SECRET);
  return googleAuthStateSchema.parse(parsed);
}

function callbackHtml(payload: Record<string, unknown>, targetOrigin: string): string {
  return `<!doctype html>
<html>
  <body>
    <script>
      (function () {
        var data = ${JSON.stringify(payload)};
        try {
          localStorage.setItem('leadflow-auth-google-result', JSON.stringify(data));
        } catch (e) {}
        if (window.opener) {
          window.opener.postMessage(data, ${JSON.stringify(targetOrigin)});
        }
        setTimeout(function () { window.close(); }, 200);
      })();
    </script>
  </body>
</html>`;
}

function setPopupCallbackHeaders(res: { setHeader: (name: string, value: string) => void }) {
  // Allow inline script + opener bridge for OAuth popup callback page.
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'");
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
}

async function fetchGoogleToken(code: string): Promise<GoogleAuthTokenPayload> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.AUTH_GOOGLE_OAUTH_REDIRECT_URI,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload as GoogleAuthTokenPayload;
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleAuthProfile> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google profil olish xatosi (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload as GoogleAuthProfile;
}

// ── POST /register ──

router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);

    const existing = await findUserByEmail(body.email);
    if (existing) {
      throw new AppError(409, 'Bu email allaqachon ro\'yxatdan o\'tgan');
    }

    const user = await createUser(body.email, body.password, body.name);
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = await createRefreshToken(user.id);

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ── POST /login ──

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);

    const user = await findUserByEmail(body.email);
    if (!user) {
      throw new AppError(401, 'Email yoki parol noto\'g\'ri');
    }

    const valid = await comparePassword(body.password, user.password_hash);
    if (!valid) {
      throw new AppError(401, 'Email yoki parol noto\'g\'ri');
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = await createRefreshToken(user.id);

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ── GET /google/init ──

router.get('/google/init', async (req, res, next) => {
  try {
    const env = getEnv();
    const origin = typeof req.query.origin === 'string'
      ? req.query.origin
      : (typeof req.headers.origin === 'string' ? req.headers.origin : undefined);
    const state = signGoogleAuthState({ origin });
    const scope = ['openid', 'email', 'profile'].join(' ');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_OAUTH_CLIENT_ID)}&redirect_uri=${encodeURIComponent(env.AUTH_GOOGLE_OAUTH_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&access_type=offline&prompt=consent&include_granted_scopes=true`;
    res.json({ auth_url: authUrl, state });
  } catch (err) {
    next(err);
  }
});

// ── GET /google/callback ──

router.get('/google/callback', async (req, res) => {
  const env = getEnv();
  const stateToken = typeof req.query.state === 'string' ? req.query.state : '';
  const targetOrigin = ((): string => {
    try {
      const parsed = verifyGoogleAuthState(stateToken);
      return parsed.origin ?? '*';
    } catch {
      return '*';
    }
  })();

  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code || !stateToken) {
      throw new Error('Google OAuth callback parametrlari toliq emas');
    }
    verifyGoogleAuthState(stateToken);

    const token = await fetchGoogleToken(code);
    const profile = await fetchGoogleProfile(token.access_token);
    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      throw new Error('Google email qaytmadi');
    }

    let user = await findUserByEmail(email);
    if (!user) {
      const randomPassword = randomBytes(24).toString('hex');
      const generatedName = profile.name?.trim() || email.split('@')[0] || 'Google User';
      try {
        user = await createUser(email, randomPassword, generatedName);
      } catch {
        user = await findUserByEmail(email);
      }
    }

    if (!user) {
      throw new Error('Foydalanuvchi yaratilmadi');
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = await createRefreshToken(user.id);

    const html = callbackHtml(
      {
        source: 'leadflow-auth-google',
        success: true,
        payload: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: profile.picture,
          },
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      },
      targetOrigin,
    );
    setPopupCallbackHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google OAuth callback xatosi';
    const html = callbackHtml(
      {
        source: 'leadflow-auth-google',
        success: false,
        error: message,
      },
      targetOrigin,
    );
    setPopupCallbackHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(400).send(html);
  }
});

// ── POST /refresh ──

router.post('/refresh', async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);

    const { userId } = await verifyRefreshToken(body.refresh_token);

    // Rotate: revoke old, issue new
    await revokeRefreshToken(body.refresh_token);

    const user = await findUserById(userId);
    if (!user) {
      throw new AppError(401, 'Foydalanuvchi topilmadi');
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const newRefreshToken = await createRefreshToken(user.id);

    res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    if (err instanceof Error && err.message.includes('yaroqsiz')) {
      res.status(401).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// ── POST /logout ──

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    await revokeRefreshToken(body.refresh_token);
    res.json({ message: 'Muvaffaqiyatli chiqildi' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ── POST /logout-all ──

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    const revoked = await revokeAllRefreshTokens(req.user!.userId);
    res.json({ message: 'Barcha sessiyalar bekor qilindi', revoked_count: revoked });
  } catch (err) {
    next(err);
  }
});

// ── GET /me ──

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      throw new AppError(404, 'Foydalanuvchi topilmadi');
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      telegram_chat_id: user.telegram_chat_id,
      created_at: user.created_at,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
