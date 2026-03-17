DROP INDEX IF EXISTS idx_webhook_events_retry_queue;
DROP INDEX IF EXISTS idx_webhook_events_status;

ALTER TABLE webhook_events
  DROP CONSTRAINT IF EXISTS chk_webhook_events_status_allowed;

ALTER TABLE webhook_events
  DROP COLUMN IF EXISTS retry_count,
  DROP COLUMN IF EXISTS max_retries,
  DROP COLUMN IF EXISTS next_retry_at,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS locked_at,
  DROP COLUMN IF EXISTS locked_by;
