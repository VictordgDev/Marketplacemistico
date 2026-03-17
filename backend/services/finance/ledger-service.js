import { query } from '../../db.js';

function getRunner(db) {
  if (db && typeof db.query === 'function') {
    return (text, params) => db.query(text, params);
  }
  return (text, params) => query(text, params);
}

export async function recordLedgerEntry({
  db,
  orderId,
  paymentId = null,
  refundId = null,
  manualPayoutId = null,
  entryType,
  side,
  amount,
  sourceKey,
  description = null,
  metadata = null
}) {
  const runner = getRunner(db);

  const result = await runner(
    `INSERT INTO financial_ledger_entries (
       order_id, payment_id, refund_id, manual_payout_id,
       entry_type, side, amount, source_key, description, metadata_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (source_key) DO NOTHING
     RETURNING *`,
    [
      orderId,
      paymentId,
      refundId,
      manualPayoutId,
      entryType,
      side,
      amount,
      sourceKey,
      description,
      metadata ? JSON.stringify(metadata) : null
    ]
  );

  return result?.rows?.[0] || result?.[0] || null;
}

export async function recordPaymentLedgerEntries({
  db,
  orderId,
  paymentId,
  grossAmount,
  platformFeeAmount,
  sellerNetAmount,
  splitMode
}) {
  await recordLedgerEntry({
    db,
    orderId,
    paymentId,
    entryType: 'payment_inflow',
    side: 'credit',
    amount: grossAmount,
    sourceKey: `payment:${paymentId}:inflow`,
    description: 'Entrada bruta de pagamento',
    metadata: { splitMode }
  });

  if (platformFeeAmount > 0) {
    await recordLedgerEntry({
      db,
      orderId,
      paymentId,
      entryType: 'platform_fee',
      side: 'credit',
      amount: platformFeeAmount,
      sourceKey: `payment:${paymentId}:platform_fee`,
      description: 'Receita de taxa da plataforma'
    });
  }

  if (sellerNetAmount > 0) {
    await recordLedgerEntry({
      db,
      orderId,
      paymentId,
      entryType: 'seller_payable',
      side: 'debit',
      amount: sellerNetAmount,
      sourceKey: `payment:${paymentId}:seller_payable`,
      description: 'Obrigacao de repasse para vendedor'
    });
  }
}

export async function recordRefundLedgerEntry({
  db,
  orderId,
  paymentId,
  refundId,
  amount
}) {
  return recordLedgerEntry({
    db,
    orderId,
    paymentId,
    refundId,
    entryType: 'refund_outflow',
    side: 'debit',
    amount,
    sourceKey: `refund:${refundId}:outflow`,
    description: 'Saida financeira de reembolso'
  });
}

export async function recordManualPayoutLedgerEntry({
  db,
  orderId,
  paymentId = null,
  manualPayoutId,
  amount
}) {
  return recordLedgerEntry({
    db,
    orderId,
    paymentId,
    manualPayoutId,
    entryType: 'manual_payout_outflow',
    side: 'debit',
    amount,
    sourceKey: `manual_payout:${manualPayoutId}:outflow`,
    description: 'Saida financeira de repasse manual'
  });
}

export async function getOrderLedgerSummary({ db, orderId }) {
  const runner = getRunner(db);
  const entriesResult = await runner(
    `SELECT id, entry_type, side, amount, source_key, description, metadata_json, created_at
     FROM financial_ledger_entries
     WHERE order_id = $1
     ORDER BY created_at ASC, id ASC`,
    [orderId]
  );

  const entries = entriesResult.rows || entriesResult;
  const credits = entries
    .filter((entry) => entry.side === 'credit')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const debits = entries
    .filter((entry) => entry.side === 'debit')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return {
    orderId,
    credits: Number(credits.toFixed(2)),
    debits: Number(debits.toFixed(2)),
    balance: Number((credits - debits).toFixed(2)),
    entries
  };
}
