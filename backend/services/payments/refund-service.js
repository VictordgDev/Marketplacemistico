import { createEfiRefund } from './efi-service.js';
import {
  assertPaymentStatusTransition,
  normalizePaymentStatus
} from './payment-status-machine.js';

function createBusinessError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function getRefundableBalance(tx, paymentId, paymentAmount) {
  const refundedRows = await tx.query(
    `SELECT COALESCE(SUM(amount), 0) AS refunded_total
     FROM refunds
     WHERE payment_id = $1
       AND status = 'processed'`,
    [paymentId]
  );

  const refundedTotal = Number(refundedRows.rows[0]?.refunded_total || 0);
  const refundable = Number((Number(paymentAmount || 0) - refundedTotal).toFixed(2));

  return {
    refundedTotal,
    refundable
  };
}

export async function processRefundForPayment({
  tx,
  payment,
  requestedAmount = null,
  reason = 'refund',
  requestedByUserId = null
}) {
  const paymentAmount = Number(payment.amount || 0);
  const currentStatus = normalizePaymentStatus(payment.status);

  if (!['approved', 'partially_refunded'].includes(currentStatus)) {
    throw createBusinessError('INVALID_PAYMENT_STATUS', 'Pagamento sem saldo para refund');
  }

  const { refundable } = await getRefundableBalance(tx, payment.id, paymentAmount);

  if (refundable <= 0) {
    throw createBusinessError('NO_REFUNDABLE_BALANCE', 'Nao existe saldo reembolsavel');
  }

  const amountToRefund = Number((requestedAmount ?? refundable).toFixed(2));
  if (amountToRefund <= 0) {
    throw createBusinessError('INVALID_REFUND_AMOUNT', 'Valor de refund invalido');
  }

  if (amountToRefund - refundable > 0.009) {
    throw createBusinessError('REFUND_AMOUNT_EXCEEDS_BALANCE', 'Valor solicitado excede o saldo reembolsavel');
  }

  if (!payment.provider_charge_id) {
    throw createBusinessError('VALIDATION_ERROR', 'provider_charge_id ausente para refund');
  }

  if (payment.provider !== 'efi') {
    throw createBusinessError('UNSUPPORTED_PROVIDER', 'No MVP, refund disponivel apenas para provider EFI');
  }

  const providerRefund = await createEfiRefund({
    providerChargeId: payment.provider_charge_id,
    amount: amountToRefund,
    reason
  });

  const refundStatus = String(providerRefund.status || '').toLowerCase();
  const persistedStatus = ['processed', 'pending'].includes(refundStatus)
    ? refundStatus
    : 'processed';

  const refundInsert = await tx.query(
    `INSERT INTO refunds (
       payment_id, order_id, provider, provider_refund_id, amount,
       reason, status, raw_response_json, requested_by_user_id,
       processed_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
             CASE WHEN $7 = 'processed' THEN CURRENT_TIMESTAMP ELSE NULL END,
             CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      payment.id,
      payment.order_id,
      payment.provider,
      providerRefund.providerRefundId || providerRefund.refundReference,
      amountToRefund,
      reason,
      persistedStatus,
      JSON.stringify(providerRefund.raw || {}),
      requestedByUserId
    ]
  );

  let finalPaymentStatus = currentStatus;
  const refundableAfter = Number((refundable - amountToRefund).toFixed(2));

  if (persistedStatus === 'processed') {
    const nextPaymentStatus = refundableAfter <= 0 ? 'refunded' : 'partially_refunded';

    assertPaymentStatusTransition(currentStatus, nextPaymentStatus);

    await tx.query(
      `UPDATE payments
       SET status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [payment.id, nextPaymentStatus]
    );

    await tx.query(
      `UPDATE orders
       SET payment_status = $2,
           status = CASE
             WHEN $2 = 'refunded' AND status IN ('pendente', 'confirmado', 'enviado') THEN 'cancelado'
             ELSE status
           END
       WHERE id = $1`,
      [payment.order_id, nextPaymentStatus]
    );

    finalPaymentStatus = nextPaymentStatus;
  }

  return {
    refund: refundInsert.rows[0],
    paymentStatus: finalPaymentStatus,
    refundableBefore: refundable,
    refundableAfter,
    amountRefunded: amountToRefund,
    provider: providerRefund
  };
}
