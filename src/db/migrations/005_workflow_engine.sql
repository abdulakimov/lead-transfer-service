CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,

  -- Trigger/source metadata for quick filtering before loading full definition
  source_type TEXT NOT NULL DEFAULT 'meta',
  trigger_type TEXT NOT NULL DEFAULT 'meta.lead.created',
  source_config JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflows_user_id ON workflows (user_id);
CREATE INDEX idx_workflows_active ON workflows (active);
CREATE INDEX idx_workflows_source_trigger ON workflows (source_type, trigger_type);

CREATE TABLE workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  definition JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (workflow_id, version)
);

CREATE INDEX idx_workflow_versions_workflow_id ON workflow_versions (workflow_id);
CREATE INDEX idx_workflow_versions_published ON workflow_versions (workflow_id, is_published);

CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,

  trigger_event_id TEXT,
  source_type TEXT NOT NULL,
  source_ref TEXT,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled', 'dlq')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  context JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs (workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs (status);
CREATE INDEX idx_workflow_runs_created_at ON workflow_runs (created_at DESC);
CREATE INDEX idx_workflow_runs_trigger_event_id ON workflow_runs (trigger_event_id);

CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_type TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'canceled')),
  input_data JSONB,
  output_data JSONB,
  error_data JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (run_id, step_order, attempt)
);

CREATE INDEX idx_workflow_steps_run_id ON workflow_steps (run_id);
CREATE INDEX idx_workflow_steps_status ON workflow_steps (status);
CREATE INDEX idx_workflow_steps_run_order ON workflow_steps (run_id, step_order);
