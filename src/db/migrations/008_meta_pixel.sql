CREATE TABLE meta_pixel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Meta Pixel',
  active BOOLEAN NOT NULL DEFAULT true,
  pixel_id TEXT NOT NULL,
  auto_page_view BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, pixel_id)
);

CREATE INDEX idx_meta_pixel_configs_user_id ON meta_pixel_configs (user_id);
CREATE INDEX idx_meta_pixel_configs_active ON meta_pixel_configs (active);

CREATE TABLE meta_pixel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES meta_pixel_configs(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,

  source TEXT NOT NULL DEFAULT 'pixel',
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  action_source TEXT NOT NULL DEFAULT 'website',
  event_source_url TEXT,

  user_data JSONB NOT NULL DEFAULT '{}',
  custom_data JSONB NOT NULL DEFAULT '{}',
  browser_meta JSONB NOT NULL DEFAULT '{}',
  blocked_reason TEXT,
  fbq_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meta_pixel_events_user_created ON meta_pixel_events (user_id, created_at DESC);
CREATE INDEX idx_meta_pixel_events_event_id ON meta_pixel_events (user_id, event_id);
