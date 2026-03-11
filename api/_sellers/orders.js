import { query } from '../../db.js';
import { sanitizeInteger } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireVendedor } from '../../auth-middleware.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  try {
    const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellers.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Vendedor não encontrado', 404);
    }
    const sellerId = sellers[0].id;

    const { page: rawPage, limit: rawLimit } = req.query;
    const page = Math.max(1, sanitizeInteger(rawPage) || 1);
    const limit = Math.min(100, Math.max(1, sanitizeInteger(rawLimit) || 20));
    const offset = (page - 1) * limit;

    const countResult = await query(
      'SELECT COUNT(*) as total FROM orders WHERE vendedor_id = $1',
      [sellerId]
    );
    const total = parseInt(countResult[0].total, 10);

    const orders = await query(
      `SELECT o.id, o.total, o.status, o.created_at,
              u.nome as comprador_nome, u.email as comprador_email
       FROM orders o
       JOIN users u ON o.comprador_id = u.id
       WHERE o.vendedor_id = $1
       ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [sellerId, limit, offset]
    );

    return sendSuccess(res, {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar pedidos do vendedor:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar pedidos', 500);
  }
}

export default withCors(requireVendedor(handler));
