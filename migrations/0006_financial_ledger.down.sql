DROP INDEX IF EXISTS idx_ledger_manual_payout_id;
DROP INDEX IF EXISTS idx_ledger_refund_id;
DROP INDEX IF EXISTS idx_ledger_payment_id;
DROP INDEX IF EXISTS idx_ledger_order_id_created;
DROP TABLE IF EXISTS financial_ledger_entries CASCADE;
