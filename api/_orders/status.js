import { query } from '../../db.js';
import { sanitizeInteger, sanitizeString } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireAuth } from '../../auth-middleware.js';

const VALID_STATUSES = ['pendente', 'confirmado', 'enviado', 'entregue', 'cancelado'];

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID inválido');
  }

  const { status } = req.body;
  const sanitizedStatus = sanitizeString(status);

  if (!VALID_STATUSES.includes(sanitizedStatus)) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      `Status inválido. Valores aceitos: ${VALID_STATUSES.join(', ')}`
    );
  }

  try {
    // Only the seller of the order can update its status
    const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellers.length === 0) {
      return sendError(res, 'FORBIDDEN', 'Acesso restrito a vendedores', 403);
    }
    const sellerId = sellers[0].id;

    const result = await query(
      `UPDATE orders SET status = $1
       WHERE id = $2 AND vendedor_id = $3
       RETURNING *`,
      [sanitizedStatus, sanitizedId, sellerId]
    );

    if (result.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Pedido não encontrado ou sem permissão', 404);
    }

    return sendSuccess(res, { order: result[0] });
  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao atualizar status do pedido', 500);
  }
}

export default withCors(requireAuth(handler));
