import { query, withTransaction } from '../db.js';
import { sanitizeInteger, sanitizeNumber } from '../sanitize.js';
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
        `SELECT o.id, o.total, o.grand_total, o.items_subtotal, o.shipping_total,
                o.payment_status, o.shipping_status, o.status, o.created_at,
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
      const {
        items,
        shipping_quote_id,
        shipping_total: rawShippingTotal,
        discount_total: rawDiscountTotal,
        shipping_address_snapshot,
        billing_address_snapshot,
        address_id: _address_id
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return sendError(res, 'VALIDATION_ERROR', 'Itens do pedido sao obrigatorios');
      }

      const productIds = items.map(i => sanitizeInteger(i.product_id)).filter(Boolean);
      if (productIds.length !== items.length) {
        return sendError(res, 'VALIDATION_ERROR', 'IDs de produtos invalidos');
      }

      const productRows = await query(
        `SELECT p.id, p.nome, p.preco, p.estoque, p.seller_id, p.publicado,
                p.weight_kg, p.height_cm, p.width_cm, p.length_cm,
                s.user_id as seller_user_id
         FROM products p
         JOIN sellers s ON p.seller_id = s.id
         WHERE p.id = ANY($1::int[])`,
        [productIds]
      );

      if (productRows.length !== productIds.length) {
        return sendError(res, 'NOT_FOUND', 'Um ou mais produtos nao foram encontrados');
      }

      const sellerIds = new Set(productRows.map(p => p.seller_id));
      if (sellerIds.size !== 1) {
        return sendError(
          res,
          'MULTI_SELLER_NOT_ALLOWED',
          'No MVP, o carrinho aceita produtos de apenas um vendedor por vez'
        );
      }

      const sellerId = productRows[0].seller_id;
      const sellerUserId = productRows[0].seller_user_id;
      if (req.user.id === sellerUserId) {
        return sendError(res, 'FORBIDDEN', 'Vendedor nao pode comprar seus proprios produtos', 403);
      }

      const orderItems = items.map(item => {
        const product = productRows.find(p => p.id === sanitizeInteger(item.product_id));
        const quantidade = Math.max(1, sanitizeInteger(item.quantidade) || 1);

        if (!product.publicado) {
          throw Object.assign(new Error(`Produto ${product.id} nao esta disponivel`), { code: 'PRODUCT_UNAVAILABLE' });
        }
        if (product.estoque < quantidade) {
          throw Object.assign(new Error(`Estoque insuficiente para produto ${product.id}`), { code: 'INSUFFICIENT_STOCK' });
        }

        return {
          product,
          quantidade,
          preco: parseFloat(product.preco),
          nameSnapshot: product.nome,
          weightSnapshot: product.weight_kg,
          dimensionSnapshot: {
            height_cm: product.height_cm,
            width_cm: product.width_cm,
            length_cm: product.length_cm
          }
        };
      });

      const itemsSubtotal = orderItems.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
      const shippingTotal = sanitizeNumber(rawShippingTotal);
      const discountTotal = sanitizeNumber(rawDiscountTotal);
      const safeShippingTotal = shippingTotal !== null && shippingTotal >= 0 ? shippingTotal : 0;
      const safeDiscountTotal = discountTotal !== null && discountTotal >= 0 ? discountTotal : 0;
      const grandTotal = Math.max(0, itemsSubtotal + safeShippingTotal - safeDiscountTotal);
      const shippingQuoteId = sanitizeInteger(shipping_quote_id);

      const order = await withTransaction(async (tx) => {
        const orderInsert = await tx.query(
          `INSERT INTO orders (
             comprador_id, vendedor_id, total, items_subtotal, shipping_total, discount_total,
             grand_total, status, payment_status, shipping_status, selected_shipping_quote_id,
             shipping_address_snapshot_json, billing_address_snapshot_json
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente', 'pending', 'pending', $8, $9, $10)
           RETURNING id`,
          [
            req.user.id,
            sellerId,
            grandTotal,
            itemsSubtotal,
            safeShippingTotal,
            safeDiscountTotal,
            grandTotal,
            shippingQuoteId,
            shipping_address_snapshot ? JSON.stringify(shipping_address_snapshot) : null,
            billing_address_snapshot ? JSON.stringify(billing_address_snapshot) : null
          ]
        );
        const orderId = orderInsert.rows[0].id;

        for (const item of orderItems) {
          await tx.query(
            `INSERT INTO order_items (
               order_id, seller_id, product_id, quantidade, preco_unitario,
               unit_price, name_snapshot, weight_snapshot, dimension_snapshot_json
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              orderId,
              sellerId,
              item.product.id,
              item.quantidade,
              item.preco,
              item.preco,
              item.nameSnapshot,
              item.weightSnapshot,
              JSON.stringify(item.dimensionSnapshot)
            ]
          );

          const stockUpdate = await tx.query(
            'UPDATE products SET estoque = estoque - $1 WHERE id = $2 AND estoque >= $1',
            [item.quantidade, item.product.id]
          );

          if (stockUpdate.rowCount === 0) {
            throw Object.assign(new Error(`Estoque insuficiente para produto ${item.product.id}`), { code: 'INSUFFICIENT_STOCK' });
          }
        }

        const orderQuery = await tx.query(
          `SELECT o.*, array_agg(json_build_object(
             'product_id', oi.product_id,
             'quantidade', oi.quantidade,
             'preco_unitario', oi.preco_unitario,
             'name_snapshot', oi.name_snapshot,
             'weight_snapshot', oi.weight_snapshot,
             'dimension_snapshot_json', oi.dimension_snapshot_json
           )) as items
           FROM orders o
           JOIN order_items oi ON o.id = oi.order_id
           WHERE o.id = $1
           GROUP BY o.id`,
          [orderId]
        );

        return orderQuery.rows[0];
      });

      return sendSuccess(res, { order }, 201);
    } catch (error) {
      if (
        error.code === 'PRODUCT_UNAVAILABLE' ||
        error.code === 'INSUFFICIENT_STOCK'
      ) {
        return sendError(res, error.code, error.message);
      }
      console.error('Erro ao criar pedido:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro ao criar pedido', 500);
    }
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
}

export default withCors(requireAuth(handler));
