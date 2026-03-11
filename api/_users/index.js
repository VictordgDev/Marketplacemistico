import { query } from '../../db.js';
import { sanitizeString, sanitizeInteger as _sanitizeInteger } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireAuth } from '../../auth-middleware.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const addresses = await query(
        'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
        [req.user.id]
      );
      return sendSuccess(res, { addresses });
    } catch (error) {
      console.error('Erro ao buscar endereços:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar endereços', 500);
    }
  }

  if (req.method === 'POST') {
    try {
      let { cep, rua, numero, complemento, bairro, cidade, estado, is_default } = req.body;

      cep = sanitizeString(cep);
      rua = sanitizeString(rua);
      numero = sanitizeString(numero);
      complemento = sanitizeString(complemento);
      bairro = sanitizeString(bairro);
      cidade = sanitizeString(cidade);
      estado = sanitizeString(estado);

      if (!cep || !rua || !numero || !bairro || !cidade || !estado) {
        return sendError(res, 'VALIDATION_ERROR', 'Campos obrigatórios: cep, rua, numero, bairro, cidade, estado');
      }

      // If this is the default address, unset other defaults first
      if (is_default) {
        await query(
          'UPDATE addresses SET is_default = false WHERE user_id = $1',
          [req.user.id]
        );
      }

      const result = await query(
        `INSERT INTO addresses (user_id, cep, rua, numero, complemento, bairro, cidade, estado, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.user.id, cep, rua, numero, complemento || '', bairro, cidade, estado, !!is_default]
      );

      return sendSuccess(res, { address: result[0] }, 201);
    } catch (error) {
      console.error('Erro ao adicionar endereço:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao adicionar endereço', 500);
    }
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
}

export default withCors(requireAuth(handler));
