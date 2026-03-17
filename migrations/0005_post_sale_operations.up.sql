ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS chk_orders_status_allowed;
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_status_allowed
  CHECK (status IN ('pendente', 'confirmado', 'enviado', 'entregue', 'cancelado', 'devolvido')) NOT VALID;

CREATE TABLE IF NOT EXISTS order_post_sale_events (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    action VARCHAR(40) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    previous_shipping_status VARCHAR(50),
    new_shipping_status VARCHAR(50),
    reason TEXT,
    requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    refund_id INTEGER REFERENCES refunds(id) ON DELETE SET NULL,
    metadata_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_post_sale_events_order_id
  ON order_post_sale_events(order_id, created_at DESC);
