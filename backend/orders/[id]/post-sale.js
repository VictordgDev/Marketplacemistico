import { withTransaction } from '../../db.js';
import { sanitizeInteger, sanitizeString } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireAuth } from '../../auth-middleware.js';
import { normalizePaymentStatus } from '../../services/payments/payment-status-machine.js';
import { processRefundForPayment } from '../../services/payments/refund-service.js';

const CANCEL_ALLOWED_STATUSES = new Set(['pendente', 'confirmado']);
const RETURN_ALLOWED_STATUSES = new Set(['entregue']);

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const orderId = sanitizeInteger(req.query?.id);
  const action = sanitizeString(req.body?.action || '').toLowerCase();
  const reason = sanitizeString(req.body?.reason || '');

  if (!orderId) {
    return sendError(res, 'VALIDATION_ERROR', 'id do pedido invalido');
  }

  if (!['cancel', 'return_request'].includes(action)) {
    return sendError(res, 'VALIDATION_ERROR', 'action deve ser cancel ou return_request');
  }

  try {
    const result = await withTransaction(async (tx) => {
      const orderResult = await tx.query(
        `SELECT id, comprador_id, vendedor_id, status, shipping_status, payment_status
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        const error = new Error('Pedido nao encontrado');
        error.code = 'NOT_FOUND';
        throw error;
      }

      const order = orderResult.rows[0];
      if (order.comprador_id !== req.user.id) {
        const error = new Error('Apenas o comprador pode solicitar cancelamento/devolucao');
        error.code = 'FORBIDDEN';
        throw error;
      }

      const previousStatus = order.status;
      const previousShippingStatus = order.shipping_status;

      let nextStatus = order.status;
      let nextShippingStatus = order.shipping_status;

      if (action === 'cancel') {
        if (!CANCEL_ALLOWED_STATUSES.has(order.status)) {
          const error = new Error('Cancelamento permitido apenas antes do envio');
          error.code = 'CANCEL_NOT_ALLOWED';
          throw error;
        }
        nextStatus = 'cancelado';
        nextShippingStatus = 'cancelled';
      }

      if (action === 'return_request') {
        if (!RETURN_ALLOWED_STATUSES.has(order.status)) {
          const error = new Error('Devolucao permitida apenas para pedido entregue');
          error.code = 'RETURN_NOT_ALLOWED';
          throw error;
        }
        nextStatus = 'devolvido';
        nextShippingStatus = 'returned';
      }

      await tx.query(
        `UPDATE orders
         SET status = $2,
             shipping_status = $3
         WHERE id = $1`,
        [orderId, nextStatus, nextShippingStatus]
      );

      const paymentResult = await tx.query(
        `SELECT id, order_id, provider, provider_charge_id, amount, status
         FROM payments
         WHERE order_id = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE OF payments`,
        [orderId]
      );

      let refund = null;
      if (paymentResult.rows.length > 0) {
        const payment = paymentResult.rows[0];
        const normalizedPaymentStatus = normalizePaymentStatus(payment.status);

        if (['approved', 'partially_refunded'].includes(normalizedPaymentStatus)) {
          const refundResult = await processRefundForPayment({
            tx,
            payment,
            requestedAmount: null,
            reason: action === 'cancel' ? 'cancelamento_pedido' : 'devolucao_pedido',
            requestedByUserId: req.user.id
          });
          refund = refundResult.refund;
        }
      }

      await tx.query(
        `INSERT INTO order_post_sale_events (
           order_id, action, previous_status, new_status,
           previous_shipping_status, new_shipping_status,
           reason, requested_by_user_id, refund_id, metadata_json
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          orderId,
          action,
          previousStatus,
          nextStatus,
          previousShippingStatus,
          nextShippingStatus,
          reason || null,
          req.user.id,
          refund?.id || null,
          JSON.stringify({ payment_status_before: order.payment_status })
        ]
      );

      const finalOrderResult = await tx.query(
        `SELECT id, status, shipping_status, payment_status
         FROM orders
         WHERE id = $1`,
        [orderId]
      );

      return {
        order: finalOrderResult.rows[0],
        refund: refund || null,
        action
      };
    });

    return sendSuccess(res, result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return sendError(res, 'NOT_FOUND', error.message, 404);
    }

    if (error.code === 'FORBIDDEN') {
      return sendError(res, 'FORBIDDEN', error.message, 403);
    }

    if (['CANCEL_NOT_ALLOWED', 'RETURN_NOT_ALLOWED', 'INVALID_PAYMENT_STATUS', 'NO_REFUNDABLE_BALANCE'].includes(error.code)) {
      return sendError(res, error.code, error.message, 400);
    }

    console.error('Erro no pos-venda:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar operacao de pos-venda', 500);
  }
}

export default withCors(requireAuth(handler));
