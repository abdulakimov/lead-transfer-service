CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,

  -- Source
  source_type TEXT NOT NULL DEFAULT 'facebook',
  source_page_id TEXT,
  source_page_access_token TEXT,
  source_form_id TEXT,

  -- Destination
  dest_type TEXT NOT NULL DEFAULT 'bitrix24',
  dest_credentials TEXT NOT NULL,

  -- Mapping & dedup
  field_mapping JSONB NOT NULL DEFAULT '{}',
  dedup_enabled BOOLEAN NOT NULL DEFAULT true,
  dedup_field TEXT NOT NULL DEFAULT 'phone',

  -- Notifications
  notify_telegram_chat_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integrations_user_id ON integrations (user_id);
CREATE INDEX idx_integrations_source_page_id ON integrations (source_page_id);
