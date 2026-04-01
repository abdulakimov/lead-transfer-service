# LeadFlow — Lead Transfer Service

SaaS platform: Facebook/Telegram lead ads → Bitrix24 / AmoCRM / Telegram notification.
O'zbekiston bozori uchun, mahalliy targetologlar asosiy foydalanuvchi.

## Tech Stack

- **Runtime**: Node.js 20+ (ES modules, `import/export`)
- **Framework**: Express.js
- **Database**: PostgreSQL 15+ (primary), Redis 7+ (queue & cache)
- **Queue**: BullMQ (job queue, retry, DLQ)
- **Auth**: JWT (users) + HMAC-SHA256 (webhook verification)
- **Language**: TypeScript (strict mode)

## Project Structure

```
src/
  api/          — Express routes (auth, integrations, leads, facebook, crm)
  webhooks/     — Facebook & Telegram webhook handlers
  workers/      — BullMQ job processors (lead-processor, retry-engine)
  services/     — Business logic (facebook.ts, bitrix.ts, amocrm.ts, telegram.ts)
  db/           — PostgreSQL queries (no ORM — raw SQL with pg)
  queue/        — BullMQ queue definitions and job types
  middleware/   — Auth, rate-limit, error-handler
  config/       — Env validation, constants
tests/
  unit/
  integration/
```

## Commands

```bash
npm run dev          # nodemon + ts-node, port 3000
npm run build        # tsc → dist/
npm run start        # production: node dist/index.js
npm run test         # vitest
npm run test:watch   # vitest --watch
npm run db:migrate   # run pending SQL migrations in db/migrations/
npm run db:seed      # seed test data
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```

## Critical Rules

### Security (NEVER bypass)
- Every Facebook webhook MUST be verified via `X-Hub-Signature-256` HMAC-SHA256 before any processing
- All CRM tokens, access tokens, webhook secrets stored AES-256 encrypted in DB — NEVER plaintext
- Every DB query MUST filter by `user_id` (row-level multi-tenant isolation)
- NEVER commit `.env` files or log sensitive tokens

### Reliability (NEVER skip)
- Webhook handlers MUST return HTTP 200 within 5 seconds — all heavy work goes to queue
- Lead delivery uses exponential backoff retry: 30s → 5m → 30m → 2h → DLQ
- Idempotency: `leadgen_id` unique constraint prevents duplicate processing
- Facebook webhook can fire multiple times for same lead — always check before creating

### Architecture decisions
- NO polling — only real-time webhooks (this is our core advantage over Albato free tier)
- No ORM — raw SQL with `pg` library for full control
- Field mapping is user-configurable JSON stored in `integrations.field_mapping`
- One integration = one Facebook page/form → one CRM destination

## Facebook Graph API Notes

- Webhook delivers only `leadgen_id`, not lead data → must call `GET /{leadgen-id}` separately
- Use Page-level Long-Lived Tokens (60 days), NOT user tokens
- Token refresh job runs daily, warns user 7 days before expiry via Telegram + email
- Required scopes: `pages_show_list`, `leads_retrieval`, `pages_read_engagement`, `pages_manage_metadata`

## CRM Integration Notes

**Bitrix24**: Incoming webhook URL pattern `https://{domain}.bitrix24.ru/rest/{userId}/{token}/`
- Phone format: `[{ VALUE: "+998...", VALUE_TYPE: "WORK" }]`
- Dedup check: `crm.duplicate.findbycomm` before creating

**AmoCRM**: OAuth 2.0 only, subdomain-based, access token expires 24h
- Auto-refresh via stored refresh_token — never let it expire silently
- Create contact first → then lead → link via `_links.contacts`

## Environment Variables

See `.env.example` for full list. Required:
```
DATABASE_URL, REDIS_URL,
FB_APP_ID, FB_APP_SECRET, FB_VERIFY_TOKEN,
ENCRYPTION_KEY,
JWT_SECRET
```

## Testing Approach

- Unit tests for: field mapping transformer, dedup logic, HMAC verification, retry scheduler
- Integration tests for: webhook → queue → CRM delivery full flow (use mock CRM server)
- Never call real Facebook/Bitrix/AmoCRM APIs in tests — use recorded fixtures in `tests/fixtures/`
- Run `npm run typecheck && npm run test` before every commit

## When Adding New Features

1. Check `src/services/` for existing patterns before writing new logic
2. New CRM integrations implement the `CrmAdapter` interface in `src/services/crm-adapter.ts`
3. All user-facing errors must be translated (uz/ru) — see `src/config/i18n.ts`
4. Every new integration type needs a test lead simulation endpoint at `POST /api/{type}/test`