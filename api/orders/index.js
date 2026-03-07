import { query } from '../db.js';
import { sanitizeInteger } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { page: rawPage, limit: rawLimit } = req.query;
      const page = Math.max(1, sanitizeInteger(rawPage) || 1);
      const limit = Math.min(100, Math.max(1, sanitizeInteger(rawLimit) || 20));
      const offset = (page - 1) * limit;

      const countResult = await query(
        'SELECT COUNT(*) as total FROM orders WHERE comprador_id = $1',
        [req.user.id]
      );
      const total = parseInt(countResult[0].total, 10);

      const orders = await query(
        `SELECT o.id, o.total, o.status, o.created_at,
                s.nome_loja as vendedor_nome
         FROM orders o
         JOIN sellers s ON o.vendedor_id = s.id
         WHERE o.comprador_id = $1
         ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );

      return sendSuccess(res, {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Erro ao buscar pedidos:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar pedidos', 500);
    }
  }

  if (req.method === 'POST') {
    try {
      const { items, address_id } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return sendError(res, 'VALIDATION_ERROR', 'Itens do pedido são obrigatórios');
      }

      // Validate and collect products
      const productIds = items.map(i => sanitizeInteger(i.product_id)).filter(Boolean);
      if (productIds.length !== items.length) {
        return sendError(res, 'VALIDATION_ERROR', 'IDs de produtos inválidos');
      }

      const productRows = await query(
        `SELECT p.id, p.preco, p.estoque, p.seller_id, p.publicado, s.user_id as seller_user_id
         FROM products p
         JOIN sellers s ON p.seller_id = s.id
         WHERE p.id = ANY($1::int[])`,
        [productIds]
      );

      if (productRows.length !== productIds.length) {
        return sendError(res, 'NOT_FOUND', 'Um ou mais produtos não foram encontrados');
      }

      // Check all items are from same seller (simplified: use first seller)
      const sellerId = productRows[0].seller_id;
      const sellerUserId = productRows[0].seller_user_id;
      if (req.user.id === sellerUserId) {
        return sendError(res, 'FORBIDDEN', 'Vendedor não pode comprar seus próprios produtos', 403);
      }

      // Build order items with quantities and validate stock
      const orderItems = items.map(item => {
        const product = productRows.find(p => p.id === sanitizeInteger(item.product_id));
        const quantidade = Math.max(1, sanitizeInteger(item.quantidade) || 1);

        if (!product.publicado) {
          throw Object.assign(new Error(`Produto ${product.id} não está disponível`), { code: 'PRODUCT_UNAVAILABLE' });
        }
        if (product.estoque < quantidade) {
          throw Object.assign(new Error(`Estoque insuficiente para produto ${product.id}`), { code: 'INSUFFICIENT_STOCK' });
        }

        return { product, quantidade, preco: parseFloat(product.preco) };
      });

      const total = orderItems.reduce((sum, i) => sum + i.preco * i.quantidade, 0);

      // Create order
      const orderResult = await query(
        `INSERT INTO orders (comprador_id, vendedor_id, total, status)
         VALUES ($1, $2, $3, 'pendente')
         RETURNING id`,
        [req.user.id, sellerId, total]
      );
      const orderId = orderResult[0].id;

      // Insert order items and update stock
      for (const item of orderItems) {
        await query(
          `INSERT INTO order_items (order_id, product_id, quantidade, preco_unitario)
           VALUES ($1, $2, $3, $4)`,
          [orderId, item.product.id, item.quantidade, item.preco]
        );
        await query(
          'UPDATE products SET estoque = estoque - $1 WHERE id = $2',
          [item.quantidade, item.product.id]
        );
      }

      const order = await query(
        `SELECT o.*, array_agg(json_build_object(
           'product_id', oi.product_id,
           'quantidade', oi.quantidade,
           'preco_unitario', oi.preco_unitario
         )) as items
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE o.id = $1
         GROUP BY o.id`,
        [orderId]
      );

      return sendSuccess(res, { order: order[0] }, 201);
    } catch (error) {
      if (error.code === 'PRODUCT_UNAVAILABLE' || error.code === 'INSUFFICIENT_STOCK') {
        return sendError(res, error.code, error.message);
      }
      console.error('Erro ao criar pedido:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao criar pedido', 500);
    }
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
}

export default withCors(requireAuth(handler));
