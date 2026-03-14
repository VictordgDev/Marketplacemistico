import { query } from '../db.js';
import { sanitizeInteger, sanitizeString } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';
import { quoteWithMelhorEnvio } from '../services/shipping/melhor-envio-service.js';

function aggregatePackageInfo(products) {
  const totalWeight = products.reduce((sum, p) => sum + Number(p.weight_kg || 0), 0);
  return {
    weight_kg: Math.max(0.1, totalWeight),
    height_cm: Math.max(...products.map(p => Number(p.height_cm || 0))),
    width_cm: Math.max(...products.map(p => Number(p.width_cm || 0))),
    length_cm: Math.max(...products.map(p => Number(p.length_cm || 0))),
    insurance_value: products.reduce((sum, p) => sum + Number(p.preco || 0), 0)
  };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  try {
    const sellerId = sanitizeInteger(req.body.seller_id);
    const destinationPostalCode = sanitizeString(req.body.destination_postal_code).replace(/\D+/g, '').slice(0, 8);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const cartId = sanitizeString(req.body.cart_id || `cart_${req.user.id}`);

    if (!sellerId || !destinationPostalCode || items.length === 0) {
      return sendError(res, 'VALIDATION_ERROR', 'seller_id, destination_postal_code e items sao obrigatorios');
    }

    const productIds = items.map(i => sanitizeInteger(i.product_id)).filter(Boolean);
    if (productIds.length !== items.length) {
      return sendError(res, 'VALIDATION_ERROR', 'IDs de produtos invalidos');
    }

    const sellerOriginRows = await query(
      'SELECT * FROM seller_shipping_profiles WHERE seller_id = $1 LIMIT 1',
      [sellerId]
    );
    if (sellerOriginRows.length === 0) {
      return sendError(res, 'VALIDATION_ERROR', 'Seller sem origem de envio configurada');
    }

    const products = await query(
      `SELECT id, seller_id, preco, weight_kg, height_cm, width_cm, length_cm
       FROM products
       WHERE id = ANY($1::int[])`,
      [productIds]
    );

    if (products.length !== productIds.length) {
      return sendError(res, 'NOT_FOUND', 'Um ou mais produtos nao encontrados');
    }

    if (products.some(product => product.seller_id !== sellerId)) {
      return sendError(res, 'MULTI_SELLER_NOT_ALLOWED', 'Itens devem pertencer ao mesmo vendedor');
    }

    const missingShippingData = products.some(
      product => !product.weight_kg || !product.height_cm || !product.width_cm || !product.length_cm
    );
    if (missingShippingData) {
      return sendError(res, 'VALIDATION_ERROR', 'Todos os produtos precisam de peso e dimensoes para cotacao');
    }

    const packageInfo = aggregatePackageInfo(products);
    const quoteResult = await quoteWithMelhorEnvio({
      sellerOrigin: sellerOriginRows[0],
      destinationPostalCode,
      packageInfo
    });

    const savedOptions = [];
    for (const option of quoteResult.options) {
      const inserted = await query(
        `INSERT INTO shipping_quotes (
           cart_id, buyer_id, seller_id, service_id, service_name, carrier_name,
           price, custom_price, delivery_time, raw_response_json, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW() + INTERVAL '30 minutes')
         RETURNING *`,
        [
          cartId,
          req.user.id,
          sellerId,
          option.serviceId,
          option.serviceName,
          option.carrierName,
          option.price,
          option.customPrice,
          option.deliveryTime,
          JSON.stringify(option.raw)
        ]
      );
      savedOptions.push(inserted[0]);
    }

    return sendSuccess(res, {
      cartId,
      packageInfo,
      quotes: savedOptions,
      providerPayload: quoteResult.payload
    });
  } catch (error) {
    console.error('Erro ao cotar frete:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao cotar frete no Melhor Envio', 500);
  }
}

export default withCors(requireAuth(handler));