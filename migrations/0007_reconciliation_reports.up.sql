CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id SERIAL PRIMARY KEY,
    run_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    summary_json JSONB,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reconciliation_issues (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    issue_type VARCHAR(80) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    webhook_event_id INTEGER REFERENCES webhook_events(id) ON DELETE SET NULL,
    manual_payout_id INTEGER REFERENCES manual_payouts(id) ON DELETE SET NULL,
    details_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_date
  ON reconciliation_runs(run_date, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_run_id
  ON reconciliation_issues(run_id, severity, issue_type);
