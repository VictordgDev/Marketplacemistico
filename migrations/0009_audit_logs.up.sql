CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(120) NOT NULL,
    resource_type VARCHAR(60) NOT NULL,
    resource_id VARCHAR(80) NOT NULL,
    before_json JSONB,
    after_json JSONB,
    metadata_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON audit_logs(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs(actor_user_id, created_at DESC);
