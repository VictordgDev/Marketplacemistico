import { query } from '../db.js';
import { sanitizeInteger } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';

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
    const sellers = await query(
      `SELECT s.id, s.nome_loja, s.categoria, s.descricao_loja, s.logo_url,
              s.avaliacao_media, s.total_vendas, s.created_at,
              u.nome as vendedor_nome
       FROM sellers s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [sanitizedId]
    );

    if (sellers.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Vendedor não encontrado', 404);
    }

    const seller = sellers[0];

    const products = await query(
      `SELECT id, nome, categoria, descricao, preco, estoque, imagem_url
       FROM products
       WHERE seller_id = $1 AND publicado = true
       ORDER BY created_at DESC`,
      [sanitizedId]
    );

    return sendSuccess(res, { seller, products });
  } catch (error) {
    console.error('Erro ao buscar vendedor:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar vendedor', 500);
  }
}

export default withCors(handler);
