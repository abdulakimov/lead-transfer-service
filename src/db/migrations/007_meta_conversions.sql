CREATE TABLE meta_capi_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Meta CAPI',
  active BOOLEAN NOT NULL DEFAULT true,
  pixel_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  test_event_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, pixel_id)
);

CREATE INDEX idx_meta_capi_configs_user_id ON meta_capi_configs (user_id);
CREATE INDEX idx_meta_capi_configs_active ON meta_capi_configs (active);

CREATE TABLE meta_capi_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES meta_capi_configs(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,

  source TEXT NOT NULL DEFAULT 'meta',
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  action_source TEXT NOT NULL DEFAULT 'website',
  event_source_url TEXT,

  user_data JSONB NOT NULL DEFAULT '{}',
  custom_data JSONB NOT NULL DEFAULT '{}',
  raw_payload JSONB NOT NULL DEFAULT '{}',
  fb_response JSONB,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dlq', 'duplicate')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, event_id)
);

CREATE INDEX idx_meta_capi_events_user_status ON meta_capi_events (user_id, status);
CREATE INDEX idx_meta_capi_events_created_at ON meta_capi_events (created_at DESC);
CREATE INDEX idx_meta_capi_events_config_id ON meta_capi_events (config_id);
