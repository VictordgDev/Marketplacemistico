import { query } from '../db.js';
import {
  sanitizeInteger,
  sanitizeString,
  sanitizeNumber,
  sanitizeUrl,
  sanitizeBoolean,
  validateDimensions
} from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireVendedor } from '../auth-middleware.js';

async function handler(req, res) {
  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID invalido');
  }

  if (req.method === 'GET') {
    try {
      const products = await query(
        `SELECT p.*, s.nome_loja, s.user_id as vendedor_id, s.avaliacao_media
         FROM products p
         JOIN sellers s ON p.seller_id = s.id
         WHERE p.id = $1`,
        [sanitizedId]
      );

      if (products.length === 0) {
        return sendError(res, 'NOT_FOUND', 'Produto nao encontrado', 404);
      }

      return sendSuccess(res, { product: products[0] });
    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar produto', 500);
    }
  }

  if (req.method === 'PUT') {
    return requireVendedor(async (request, response) => {
      try {
        const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [request.user.id]);
        if (sellers.length === 0) {
          return sendError(response, 'NOT_FOUND', 'Vendedor nao encontrado', 404);
        }
        const sellerId = sellers[0].id;

        let {
          nome,
          categoria,
          descricao,
          preco,
          estoque,
          imagemUrl,
          publicado,
          weightKg,
          heightCm,
          widthCm,
          lengthCm,
          insuranceValue,
          weight_kg,
          height_cm,
          width_cm,
          length_cm,
          insurance_value
        } = request.body;

        nome = sanitizeString(nome);
        categoria = sanitizeString(categoria);
        descricao = sanitizeString(descricao);
        preco = sanitizeNumber(preco);
        estoque = sanitizeInteger(estoque);
        imagemUrl = sanitizeUrl(imagemUrl);
        publicado = sanitizeBoolean(publicado);

        const dimensionsValidation = validateDimensions({
          weightKg: weightKg ?? weight_kg,
          heightCm: heightCm ?? height_cm,
          widthCm: widthCm ?? width_cm,
          lengthCm: lengthCm ?? length_cm,
          insuranceValue: insuranceValue ?? insurance_value
        }, publicado);

        if (!nome || !categoria || preco === null) {
          return sendError(response, 'VALIDATION_ERROR', 'Campos obrigatorios faltando (nome, categoria, preco)');
        }

        if (!dimensionsValidation.ok) {
          return sendError(response, 'VALIDATION_ERROR', dimensionsValidation.reason);
        }

        if (estoque === null || estoque < 0) {
          estoque = 0;
        }

        const d = dimensionsValidation.value;

        const result = await query(
          `UPDATE products
           SET nome=$1, categoria=$2, descricao=$3, preco=$4, estoque=$5, imagem_url=$6, publicado=$7,
               weight_kg=$8, height_cm=$9, width_cm=$10, length_cm=$11, insurance_value=$12,
               updated_at=CURRENT_TIMESTAMP
           WHERE id=$13 AND seller_id=$14
           RETURNING *`,
          [
            nome,
            categoria,
            descricao,
            preco,
            estoque,
            imagemUrl || '',
            publicado,
            d.weightKg,
            d.heightCm,
            d.widthCm,
            d.lengthCm,
            d.insuranceValue,
            sanitizedId,
            sellerId
          ]
        );

        if (result.length === 0) {
          return sendError(response, 'NOT_FOUND', 'Produto nao encontrado ou sem permissao', 404);
        }

        return sendSuccess(response, { product: result[0] });
      } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        return sendError(response, 'INTERNAL_ERROR', 'Erro ao atualizar produto', 500);
      }
    })(req, res);
  }

  if (req.method === 'DELETE') {
    return requireVendedor(async (request, response) => {
      try {
        const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [request.user.id]);
        if (sellers.length === 0) {
          return sendError(response, 'NOT_FOUND', 'Vendedor nao encontrado', 404);
        }
        const sellerId = sellers[0].id;

        const result = await query(
          'DELETE FROM products WHERE id = $1 AND seller_id = $2 RETURNING id',
          [sanitizedId, sellerId]
        );

        if (result.length === 0) {
          return sendError(response, 'NOT_FOUND', 'Produto nao encontrado ou sem permissao', 404);
        }

        return sendSuccess(response, { message: 'Produto deletado' });
      } catch (error) {
        console.error('Erro ao deletar produto:', error);
        return sendError(response, 'INTERNAL_ERROR', 'Erro ao deletar produto', 500);
      }
    })(req, res);
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
}

export default withCors(handler);