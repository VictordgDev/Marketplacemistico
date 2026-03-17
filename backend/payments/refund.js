import { withTransaction } from '../db.js';
import { sanitizeInteger, sanitizeNumber, sanitizeString } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';
import { processRefundForPayment } from '../services/payments/refund-service.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const paymentId = sanitizeInteger(req.body?.payment_id);
  const orderId = sanitizeInteger(req.body?.order_id);
  const reason = sanitizeString(req.body?.reason || 'refund_total');
  const requestedAmountRaw = req.body?.amount;
  const requestedAmount =
    requestedAmountRaw === undefined || requestedAmountRaw === null
      ? null
      : sanitizeNumber(requestedAmountRaw);

  if (!paymentId && !orderId) {
    return sendError(res, 'VALIDATION_ERROR', 'payment_id ou order_id obrigatorio');
  }
  if (requestedAmount !== null && requestedAmount <= 0) {
    return sendError(res, 'VALIDATION_ERROR', 'amount deve ser maior que zero');
  }

  try {
    const result = await withTransaction(async (tx) => {
      const selector = paymentId ? 'p.id = $1' : 'p.order_id = $1';

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
      const refundResult = await processRefundForPayment({
        tx,
        payment,
        requestedAmount,
        reason,
        requestedByUserId: req.user.id
      });

      return {
        refund: refundResult.refund,
        payment: {
          id: payment.id,
          order_id: payment.order_id,
          status: refundResult.paymentStatus
        },
        refundable_before: refundResult.refundableBefore,
        refundable_after: refundResult.refundableAfter,
        provider: refundResult.provider
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
        'INVALID_REFUND_AMOUNT',
        'REFUND_AMOUNT_EXCEEDS_BALANCE',
        'VALIDATION_ERROR',
        'UNSUPPORTED_PROVIDER',
        'INVALID_PAYMENT_STATUS_TRANSITION'
      ].includes(error.code)
    ) {
      return sendError(res, error.code, error.message, 400);
    }

    console.error('Erro ao criar refund:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar refund', 500);
  }
}

export default withCors(requireAuth(handler));
