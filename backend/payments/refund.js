import { withTransaction } from '../db.js';
import { sanitizeInteger, sanitizeString } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';
import { createEfiRefund } from '../services/payments/efi-service.js';
import {
  assertPaymentStatusTransition,
  normalizePaymentStatus
} from '../services/payments/payment-status-machine.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const paymentId = sanitizeInteger(req.body?.payment_id);
  const orderId = sanitizeInteger(req.body?.order_id);
  const reason = sanitizeString(req.body?.reason || 'refund_total');

  if (!paymentId && !orderId) {
    return sendError(res, 'VALIDATION_ERROR', 'payment_id ou order_id obrigatorio');
  }

  try {
    const result = await withTransaction(async (tx) => {
      const selector = paymentId
        ? 'p.id = $1'
        : 'p.order_id = $1';

      const paymentResult = await tx.query(
        `SELECT p.id, p.order_id, p.provider, p.provider_charge_id, p.amount, p.status,
                o.comprador_id, o.vendedor_id
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE ${selector}
           AND (o.comprador_id = $2 OR o.vendedor_id IN (SELECT id FROM sellers WHERE user_id = $2))
         ORDER BY p.created_at DESC
         LIMIT 1
         FOR UPDATE OF p`,
        [paymentId || orderId, req.user.id]
      );

      if (paymentResult.rows.length === 0) {
        const error = new Error('Pagamento nao encontrado ou sem permissao');
        error.code = 'NOT_FOUND';
        throw error;
      }

      const payment = paymentResult.rows[0];
      const paymentAmount = Number(payment.amount || 0);
      const currentStatus = normalizePaymentStatus(payment.status);

      if (!['approved', 'partially_refunded'].includes(currentStatus)) {
        const error = new Error('Pagamento sem saldo para refund');
        error.code = 'INVALID_PAYMENT_STATUS';
        throw error;
      }

      const refundedRows = await tx.query(
        `SELECT COALESCE(SUM(amount), 0) AS refunded_total
         FROM refunds
         WHERE payment_id = $1
           AND status = 'processed'`,
        [payment.id]
      );
      const refundedTotal = Number(refundedRows.rows[0]?.refunded_total || 0);
      const refundable = Number((paymentAmount - refundedTotal).toFixed(2));

      if (refundable <= 0) {
        const error = new Error('Nao existe saldo reembolsavel');
        error.code = 'NO_REFUNDABLE_BALANCE';
        throw error;
      }

      if (Math.abs(refundable - paymentAmount) > 0.009) {
        const error = new Error('Pagamento ja possui refund parcial; use refund parcial para continuar');
        error.code = 'PARTIAL_REFUND_EXISTS';
        throw error;
      }

      if (!payment.provider_charge_id) {
        const error = new Error('provider_charge_id ausente para refund');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      if (payment.provider !== 'efi') {
        const error = new Error('No MVP, refund disponivel apenas para provider EFI');
        error.code = 'UNSUPPORTED_PROVIDER';
        throw error;
      }

      const providerRefund = await createEfiRefund({
        providerChargeId: payment.provider_charge_id,
        amount: refundable,
        reason
      });

      const refundStatus = sanitizeString(providerRefund.status || '').toLowerCase();
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
          refundable,
          reason,
          persistedStatus,
          JSON.stringify(providerRefund.raw || {}),
          req.user.id
        ]
      );

      if (persistedStatus === 'processed') {
        assertPaymentStatusTransition(currentStatus, 'refunded');

        await tx.query(
          `UPDATE payments
           SET status = 'refunded',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [payment.id]
        );

        await tx.query(
          `UPDATE orders
           SET payment_status = 'refunded',
               status = CASE WHEN status <> 'entregue' THEN 'cancelado' ELSE status END
           WHERE id = $1`,
          [payment.order_id]
        );
      }

      return {
        refund: refundInsert.rows[0],
        payment: {
          id: payment.id,
          order_id: payment.order_id,
          status: persistedStatus === 'processed' ? 'refunded' : currentStatus
        },
        refundable_before: refundable,
        provider: providerRefund
      };
    });

    return sendSuccess(res, result, 201);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return sendError(res, 'NOT_FOUND', error.message, 404);
    }

    if (
      [
        'INVALID_PAYMENT_STATUS',
        'NO_REFUNDABLE_BALANCE',
        'PARTIAL_REFUND_EXISTS',
        'VALIDATION_ERROR',
        'UNSUPPORTED_PROVIDER',
        'INVALID_PAYMENT_STATUS_TRANSITION'
      ].includes(error.code)
    ) {
      return sendError(res, error.code, error.message, 400);
    }

    console.error('Erro ao criar refund total:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar refund total', 500);
  }
}

export default withCors(requireAuth(handler));
