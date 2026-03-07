import { query } from '../db.js';
import { sanitizeString } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireVendedor } from '../auth-middleware.js';

async function handler(req, res) {
  try {
    const sellers = await query(
      `SELECT s.id, s.nome_loja, s.categoria, s.descricao_loja, s.logo_url,
              s.avaliacao_media, s.total_vendas, s.created_at,
              u.nome, u.email, u.telefone
       FROM sellers s
       JOIN users u ON s.user_id = u.id
       WHERE s.user_id = $1`,
      [req.user.id]
    );

    if (sellers.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Perfil de vendedor não encontrado', 404);
    }

    if (req.method === 'GET') {
      return sendSuccess(res, { seller: sellers[0] });
    }

    if (req.method === 'PUT') {
      let { nome_loja, categoria, descricao_loja, logo_url } = req.body;

      nome_loja = sanitizeString(nome_loja);
      categoria = sanitizeString(categoria);
      descricao_loja = sanitizeString(descricao_loja);
      logo_url = sanitizeString(logo_url);

      if (!nome_loja || !categoria) {
        return sendError(res, 'VALIDATION_ERROR', 'Nome da loja e categoria são obrigatórios');
      }

      const result = await query(
        `UPDATE sellers
         SET nome_loja = $1, categoria = $2, descricao_loja = $3, logo_url = $4
         WHERE user_id = $5
         RETURNING id, nome_loja, categoria, descricao_loja, logo_url, avaliacao_media, total_vendas`,
        [nome_loja, categoria, descricao_loja || '', logo_url || '', req.user.id]
      );

      return sendSuccess(res, { seller: result[0] });
    }

    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  } catch (error) {
    console.error('Erro no perfil do vendedor:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar dados do vendedor', 500);
  }
}

export default withCors(requireVendedor(handler));
