DROP INDEX IF EXISTS idx_order_post_sale_events_order_id;
DROP TABLE IF EXISTS order_post_sale_events CASCADE;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS chk_orders_status_allowed;
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_status_allowed
  CHECK (status IN ('pendente', 'confirmado', 'enviado', 'entregue', 'cancelado')) NOT VALID;
