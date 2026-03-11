import { query } from '../db.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  try {
    const users = await query(
      `SELECT u.id, u.tipo, u.nome, u.email, u.telefone, u.cpf_cnpj, u.tipo_documento,
              u.created_at, u.updated_at,
              s.id as seller_id, s.nome_loja, s.categoria, s.descricao_loja,
              s.logo_url, s.avaliacao_media, s.total_vendas
       FROM users u
       LEFT JOIN sellers s ON u.id = s.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (users.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Usuário não encontrado', 404);
    }

    return sendSuccess(res, { user: users[0] });
  } catch (error) {
    console.error('Erro ao buscar usuário autenticado:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar dados do usuário', 500);
  }
}

export default withCors(requireAuth(handler));
