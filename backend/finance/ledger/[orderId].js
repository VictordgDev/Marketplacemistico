import { query } from '../../db.js';
import { sanitizeInteger } from '../../sanitize.js';
import { sendSuccess, sendError } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireAuth } from '../../auth-middleware.js';
import { getOrderLedgerSummary } from '../../services/finance/ledger-service.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const orderId = sanitizeInteger(req.query?.orderId);
  if (!orderId) {
    return sendError(res, 'VALIDATION_ERROR', 'orderId invalido');
  }

  try {
    const permissionRows = await query(
      `SELECT o.id
       FROM orders o
       JOIN sellers s ON s.id = o.vendedor_id
       WHERE o.id = $1
         AND (o.comprador_id = $2 OR s.user_id = $2)
       LIMIT 1`,
      [orderId, req.user.id]
    );

    if (permissionRows.length === 0) {
      return sendError(res, 'FORBIDDEN', 'Sem permissao para visualizar ledger do pedido', 403);
    }

    const summary = await getOrderLedgerSummary({ orderId });
    return sendSuccess(res, { ledger: summary });
  } catch (error) {
    console.error('Erro ao consultar ledger:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao consultar ledger financeiro', 500);
  }
}

export default withCors(requireAuth(handler));
