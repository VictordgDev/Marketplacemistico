import { query } from '../../db.js';
import { sanitizeInteger } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireVendedor } from '../../auth-middleware.js';

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID inválido');
  }

  try {
    const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellers.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Vendedor não encontrado', 404);
    }
    const sellerId = sellers[0].id;

    // Fetch current publish state
    const current = await query(
      'SELECT publicado FROM products WHERE id = $1 AND seller_id = $2',
      [sanitizedId, sellerId]
    );

    if (current.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Produto não encontrado ou sem permissão', 404);
    }

    const novoEstado = !current[0].publicado;

    const result = await query(
      'UPDATE products SET publicado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND seller_id = $3 RETURNING *',
      [novoEstado, sanitizedId, sellerId]
    );

    return sendSuccess(res, { product: result[0] });
  } catch (error) {
    console.error('Erro ao atualizar publicação do produto:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao atualizar publicação', 500);
  }
}

export default withCors(requireVendedor(handler));
