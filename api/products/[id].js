import { query } from '../db.js';
import { sanitizeInteger, sanitizeString, sanitizeNumber, sanitizeUrl, sanitizeBoolean } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth as _requireAuth, requireVendedor } from '../auth-middleware.js';

async function handler(req, res) {
  const { id } = req.query;
  const sanitizedId = sanitizeInteger(id);

  if (!sanitizedId) {
    return sendError(res, 'INVALID_ID', 'ID inválido');
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
        return sendError(res, 'NOT_FOUND', 'Produto não encontrado', 404);
      }

      return sendSuccess(res, { product: products[0] });
    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar produto', 500);
    }
  }

  if (req.method === 'PUT') {
    return requireVendedor(async (req, res) => {
      try {
        const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
        if (sellers.length === 0) {
          return sendError(res, 'NOT_FOUND', 'Vendedor não encontrado', 404);
        }
        const sellerId = sellers[0].id;

        let { nome, categoria, descricao, preco, estoque, imagemUrl, publicado } = req.body;

        nome = sanitizeString(nome);
        categoria = sanitizeString(categoria);
        descricao = sanitizeString(descricao);
        preco = sanitizeNumber(preco);
        estoque = sanitizeInteger(estoque);
        imagemUrl = sanitizeUrl(imagemUrl);
        publicado = sanitizeBoolean(publicado);

        if (!nome || !categoria || preco === null) {
          return sendError(res, 'VALIDATION_ERROR', 'Campos obrigatórios faltando (nome, categoria, preco)');
        }

        if (estoque === null || estoque < 0) {
          estoque = 0;
        }

        const result = await query(
          `UPDATE products
           SET nome=$1, categoria=$2, descricao=$3, preco=$4, estoque=$5, imagem_url=$6, publicado=$7, updated_at=CURRENT_TIMESTAMP
           WHERE id=$8 AND seller_id=$9
           RETURNING *`,
          [nome, categoria, descricao, preco, estoque, imagemUrl || '', publicado, sanitizedId, sellerId]
        );

        if (result.length === 0) {
          return sendError(res, 'NOT_FOUND', 'Produto não encontrado ou sem permissão', 404);
        }

        return sendSuccess(res, { product: result[0] });
      } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        return sendError(res, 'INTERNAL_ERROR', 'Erro ao atualizar produto', 500);
      }
    })(req, res);
  }

  if (req.method === 'DELETE') {
    return requireVendedor(async (req, res) => {
      try {
        const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
        if (sellers.length === 0) {
          return sendError(res, 'NOT_FOUND', 'Vendedor não encontrado', 404);
        }
        const sellerId = sellers[0].id;

        const result = await query(
          'DELETE FROM products WHERE id = $1 AND seller_id = $2 RETURNING id',
          [sanitizedId, sellerId]
        );

        if (result.length === 0) {
          return sendError(res, 'NOT_FOUND', 'Produto não encontrado ou sem permissão', 404);
        }

        console.log('✅ Produto deletado:', sanitizedId);
        return sendSuccess(res, { message: 'Produto deletado' });
      } catch (error) {
        console.error('Erro ao deletar produto:', error);
        return sendError(res, 'INTERNAL_ERROR', 'Erro ao deletar produto', 500);
      }
    })(req, res);
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
}

export default withCors(handler);
