ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100);

UPDATE webhook_events
SET status = 'received'
WHERE status IS NULL OR BTRIM(status) = '';

ALTER TABLE webhook_events
  DROP CONSTRAINT IF EXISTS chk_webhook_events_status_allowed;
ALTER TABLE webhook_events
  ADD CONSTRAINT chk_webhook_events_status_allowed
  CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry_queue
  ON webhook_events(provider, status, next_retry_at, retry_count)
  WHERE provider = 'efi' AND status = 'failed';

CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON webhook_events(provider, status, created_at DESC);
