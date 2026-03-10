import { query } from '../../db.js';
import { sanitizeString, sanitizeInteger } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireAuth } from '../../auth-middleware.js';

async function handler(req, res) {
  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID inválido');
  }

  if (req.method === 'PUT') {
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

      if (is_default) {
        await query(
          'UPDATE addresses SET is_default = false WHERE user_id = $1',
          [req.user.id]
        );
      }

      const result = await query(
        `UPDATE addresses
         SET cep=$1, rua=$2, numero=$3, complemento=$4, bairro=$5, cidade=$6, estado=$7, is_default=$8
         WHERE id=$9 AND user_id=$10
         RETURNING *`,
        [cep, rua, numero, complemento || '', bairro, cidade, estado, !!is_default, sanitizedId, req.user.id]
      );

      if (result.length === 0) {
        return sendError(res, 'NOT_FOUND', 'Endereço não encontrado ou sem permissão', 404);
      }

      return sendSuccess(res, { address: result[0] });
    } catch (error) {
      console.error('Erro ao atualizar endereço:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao atualizar endereço', 500);
    }
  }

  if (req.method === 'DELETE') {
    try {
      const result = await query(
        'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id',
        [sanitizedId, req.user.id]
      );

      if (result.length === 0) {
        return sendError(res, 'NOT_FOUND', 'Endereço não encontrado ou sem permissão', 404);
      }

      return sendSuccess(res, { message: 'Endereço removido' });
    } catch (error) {
      console.error('Erro ao remover endereço:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao remover endereço', 500);
    }
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
}

export default withCors(requireAuth(handler));
