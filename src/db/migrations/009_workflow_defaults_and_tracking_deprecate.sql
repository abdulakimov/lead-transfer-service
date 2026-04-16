-- Retarget new workflow defaults to lead bridge trigger.
ALTER TABLE workflows
  ALTER COLUMN source_type SET DEFAULT 'lead_bridge',
  ALTER COLUMN trigger_type SET DEFAULT 'lead.received';

-- Deprecate Meta tracking write-path usage without dropping historical data.
UPDATE meta_capi_configs
SET active = false,
    updated_at = NOW()
WHERE active = true;

UPDATE meta_pixel_configs
SET active = false,
    updated_at = NOW()
WHERE active = true;
