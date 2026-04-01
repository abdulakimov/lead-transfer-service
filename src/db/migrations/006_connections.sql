CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('facebook', 'google')),
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  credentials TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, external_id)
);

CREATE INDEX idx_connections_user_id ON connections (user_id);
CREATE INDEX idx_connections_provider ON connections (provider);

