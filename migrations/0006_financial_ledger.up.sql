CREATE TABLE IF NOT EXISTS financial_ledger_entries (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    refund_id INTEGER REFERENCES refunds(id) ON DELETE SET NULL,
    manual_payout_id INTEGER REFERENCES manual_payouts(id) ON DELETE SET NULL,
    entry_type VARCHAR(60) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('credit', 'debit')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    source_key VARCHAR(140) NOT NULL UNIQUE,
    description TEXT,
    metadata_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_order_id_created
  ON financial_ledger_entries(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_payment_id
  ON financial_ledger_entries(payment_id);

CREATE INDEX IF NOT EXISTS idx_ledger_refund_id
  ON financial_ledger_entries(refund_id);

CREATE INDEX IF NOT EXISTS idx_ledger_manual_payout_id
  ON financial_ledger_entries(manual_payout_id);
