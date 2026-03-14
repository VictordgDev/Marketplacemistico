import { query } from '../db.js';
import { sanitizeString, sanitizePhone, validatePhone } from '../sanitize.js';
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
        return sendError(res, 'NOT_FOUND', 'Usuario nao encontrado', 404);
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
        return sendError(res, 'VALIDATION_ERROR', 'Nome e obrigatorio');
      }

      if (telefone) {
        const phoneValidation = validatePhone(telefone);
        if (!phoneValidation.ok) {
          return sendError(res, 'VALIDATION_ERROR', phoneValidation.reason);
        }

        const existingPhone = await query(
          'SELECT id FROM users WHERE telefone = $1 AND id <> $2 LIMIT 1',
          [phoneValidation.value, req.user.id]
        );
        if (existingPhone.length > 0) {
          return sendError(res, 'PHONE_TAKEN', 'Telefone ja cadastrado');
        }

        telefone = phoneValidation.value;
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

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
}

export default withCors(requireAuth(handler));