import { query } from '../db.js';
import { sanitizeString, sanitizeEmail as _sanitizeEmail, sanitizePhone } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const users = await query(
        `SELECT u.id, u.tipo, u.nome, u.email, u.telefone, u.cpf_cnpj, u.tipo_documento,
                u.created_at, u.updated_at,
                s.id as seller_id, s.nome_loja, s.categoria, s.descricao_loja
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
      console.error('Erro ao buscar perfil:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar perfil', 500);
    }
  }

  if (req.method === 'PUT') {
    try {
      let { nome, telefone } = req.body;

      nome = sanitizeString(nome);
      telefone = sanitizePhone(telefone);

      if (!nome) {
        return sendError(res, 'VALIDATION_ERROR', 'Nome é obrigatório');
      }

      await query(
        'UPDATE users SET nome = $1, telefone = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [nome, telefone || null, req.user.id]
      );

      const updated = await query(
        `SELECT u.id, u.tipo, u.nome, u.email, u.telefone, u.cpf_cnpj, u.tipo_documento,
                u.created_at, u.updated_at,
                s.id as seller_id, s.nome_loja, s.categoria, s.descricao_loja
         FROM users u
         LEFT JOIN sellers s ON u.id = s.user_id
         WHERE u.id = $1`,
        [req.user.id]
      );

      return sendSuccess(res, { user: updated[0] });
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao atualizar perfil', 500);
    }
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
}

export default withCors(requireAuth(handler));
