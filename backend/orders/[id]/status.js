import { query } from '../../db.js';
import { sanitizeInteger, sanitizeString } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireAuth } from '../../auth-middleware.js';
import { recordAuditLog } from '../../services/audit/audit-service.js';

const VALID_STATUSES = ['pendente', 'confirmado', 'enviado', 'entregue', 'cancelado', 'devolvido'];

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID invalido');
  }

  const { status } = req.body;
  const sanitizedStatus = sanitizeString(status);

  if (!VALID_STATUSES.includes(sanitizedStatus)) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      `Status invalido. Valores aceitos: ${VALID_STATUSES.join(', ')}`
    );
  }

  try {
    const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellers.length === 0) {
      return sendError(res, 'FORBIDDEN', 'Acesso restrito a vendedores', 403);
    }
    const sellerId = sellers[0].id;

    const existing = await query(
      `SELECT id, status, shipping_status, payment_status
       FROM orders
       WHERE id = $1 AND vendedor_id = $2
       LIMIT 1`,
      [sanitizedId, sellerId]
    );

    if (existing.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Pedido nao encontrado ou sem permissao', 404);
    }

    const beforeOrder = existing[0];

    const result = await query(
      `UPDATE orders SET status = $1
       WHERE id = $2 AND vendedor_id = $3
       RETURNING *`,
      [sanitizedStatus, sanitizedId, sellerId]
    );

    const updated = result[0];

    await recordAuditLog({
      actorUserId: req.user.id,
      action: 'order.status_changed',
      resourceType: 'order',
      resourceId: sanitizedId,
      before: {
        status: beforeOrder.status,
        shipping_status: beforeOrder.shipping_status,
        payment_status: beforeOrder.payment_status
      },
      after: {
        status: updated.status,
        shipping_status: updated.shipping_status,
        payment_status: updated.payment_status
      },
      metadata: {
        updated_by_seller_id: sellerId
      }
    });

    return sendSuccess(res, { order: updated });
  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao atualizar status do pedido', 500);
  }
}

export default withCors(requireAuth(handler));
