CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  leadgen_id TEXT NOT NULL,
  fb_page_id TEXT NOT NULL,
  raw_data JSONB,
  mapped_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_leads_leadgen_id ON leads (leadgen_id);
CREATE INDEX idx_leads_integration_id ON leads (integration_id);
CREATE INDEX idx_leads_status ON leads (status);
