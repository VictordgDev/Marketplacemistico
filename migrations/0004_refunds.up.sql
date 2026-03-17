CREATE TABLE IF NOT EXISTS refunds (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_refund_id VARCHAR(255),
    amount NUMERIC(10,2) NOT NULL,
    reason TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'processed',
    raw_response_json JSONB,
    requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_refunds_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_refunds_status_allowed CHECK (status IN ('pending', 'processed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_provider_refund_unique
  ON refunds(provider, provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;
