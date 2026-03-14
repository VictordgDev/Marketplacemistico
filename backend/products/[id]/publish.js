import { query } from '../../db.js';
import { sanitizeInteger } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireVendedor } from '../../auth-middleware.js';

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID invalido');
  }

  try {
    const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellers.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Vendedor nao encontrado', 404);
    }
    const sellerId = sellers[0].id;

    const current = await query(
      `SELECT publicado, weight_kg, height_cm, width_cm, length_cm
       FROM products
       WHERE id = $1 AND seller_id = $2`,
      [sanitizedId, sellerId]
    );

    if (current.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Produto nao encontrado ou sem permissao', 404);
    }

    const novoEstado = !current[0].publicado;

    if (
      novoEstado &&
      (!current[0].weight_kg || !current[0].height_cm || !current[0].width_cm || !current[0].length_cm)
    ) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'Peso e dimensoes sao obrigatorios para publicar o produto'
      );
    }

    const result = await query(
      'UPDATE products SET publicado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND seller_id = $3 RETURNING *',
      [novoEstado, sanitizedId, sellerId]
    );

    return sendSuccess(res, { product: result[0] });
  } catch (error) {
    console.error('Erro ao atualizar publicacao do produto:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao atualizar publicacao', 500);
  }
}

export default withCors(requireVendedor(handler));