import { query } from '../db.js';
import { sanitizeInteger } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID inválido');
  }

  try {
    const orders = await query(
      `SELECT o.id, o.total, o.status, o.created_at,
              s.nome_loja as vendedor_nome,
              u.nome as comprador_nome
       FROM orders o
       JOIN sellers s ON o.vendedor_id = s.id
       JOIN users u ON o.comprador_id = u.id
       WHERE o.id = $1
         AND (o.comprador_id = $2 OR s.user_id = $2)`,
      [sanitizedId, req.user.id]
    );

    if (orders.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Pedido não encontrado ou sem permissão', 404);
    }

    const items = await query(
      `SELECT oi.*, p.nome as produto_nome, p.imagem_url
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [sanitizedId]
    );

    return sendSuccess(res, { order: { ...orders[0], items } });
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar pedido', 500);
  }
}

export default withCors(requireAuth(handler));
