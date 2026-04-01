# Security Rotation Checklist

Use this checklist when credentials may have been exposed in chat logs, local files, screenshots, or accidental commits.

## Scope
Rotate at minimum:
- Facebook Page Access Token
- Facebook App Secret (if exposure suspected)
- Bitrix24 webhook URL/token
- Telegram Bot Token
- JWT secret
- Encryption key

## Preparation
1. Identify affected environments: local, staging, production.
2. Schedule a maintenance window if live traffic is active.
3. Notify operators about temporary lead delivery disruptions.
4. Prepare rollback owner and verification owner.

## 1) Facebook Page Access Token Rotation
1. Generate a new Page Access Token in Meta.
2. Validate permissions (`leads_retrieval`, `pages_manage_metadata`, etc.).
3. Update integration `source_page_access_token` via API/UI.
4. Run preflight: `GET /api/integrations/:id/preflight`.
5. Submit Meta test lead and confirm `delivered` status.
6. Revoke old token in Meta.

## 2) Facebook App Secret Rotation (if needed)
1. Rotate app secret in Meta Developer settings.
2. Update `FB_APP_SECRET` in runtime secrets manager/env.
3. Restart service instances.
4. Re-verify webhook signature flow with Meta verification challenge.
5. Confirm signed webhook ingestion returns 200.

## 3) Bitrix24 Webhook Credential Rotation
1. Create new incoming webhook in Bitrix24.
2. Update integration `dest_credentials` with new webhook URL.
3. Run `POST /api/integrations/:id/test`.
4. Confirm lead creation in Bitrix24.
5. Disable/remove old Bitrix webhook.

## 4) Telegram Bot Token Rotation
1. Regenerate bot token via BotFather.
2. Update `TELEGRAM_BOT_TOKEN` in env/secrets manager.
3. Restart service.
4. Trigger notification path and verify bot can send message.
5. Invalidate old token.

## 5) JWT Secret Rotation
1. Generate a new strong random secret.
2. Update `JWT_SECRET` in env/secrets manager.
3. Restart service.
4. Force re-authentication for all active sessions (existing tokens become invalid).
5. Confirm login + refresh flows work with new tokens.

## 6) Encryption Key Rotation
Important: Existing encrypted DB fields depend on old key.

Safe rotation sequence:
1. Enter maintenance mode (or pause write operations for integrations update path).
2. Export encrypted fields and decrypt with old key.
3. Re-encrypt values with new key.
4. Update `ENCRYPTION_KEY` in env/secrets manager.
5. Deploy/restart service.
6. Run integration preflight + integration test endpoints.
7. Confirm Facebook fetch and CRM delivery paths are healthy.

If full re-encryption is not immediately possible:
- do not switch key in production yet
- first complete a scripted migration plan

## Post-Rotation Verification
For each tenant integration:
1. `GET /api/integrations/:id/preflight` is `ready` or acceptable `partial`.
2. `POST /api/integrations/:id/test` succeeds.
3. Webhook verify endpoint works.
4. Real or controlled test lead reaches `delivered`.
5. No auth/crypto errors in logs.

## Hygiene Follow-up
1. Remove exposed secrets from local docs/files where possible.
2. Confirm `.env` is not committed and remains gitignored.
3. Keep `.env.example` placeholder-only.
4. Record rotation timestamp, owner, and impacted tenants.
