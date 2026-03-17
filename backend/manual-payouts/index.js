import { query } from '../db.js';
import { sanitizeInteger, sanitizeString } from '../sanitize.js';
import { sendError, sendSuccess } from '../response.js';
import { withCors } from '../middleware.js';
import { requireInternalRole } from '../auth-middleware.js';
import { requireFinanceOpsSecret } from '../finance/ops-auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const auth = requireFinanceOpsSecret(req, res);
  if (!auth.ok) {
    return undefined;
  }

  try {
    const status = sanitizeString(req.query?.status || '').toLowerCase();
    const page = Math.max(1, sanitizeInteger(req.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, sanitizeInteger(req.query?.limit) || 20));
    const offset = (page - 1) * limit;

    const values = [];
    let whereClause = '';

    if (status) {
      values.push(status);
      whereClause = 'WHERE status = $1';
    }

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM manual_payouts
       ${whereClause}`,
      values
    );

    values.push(limit, offset);
    const payouts = await query(
      `SELECT id, seller_id, order_id, amount, fee_amount, status,
              scheduled_for, paid_at, external_reference,
              proof_url, review_reason, approved_at, rejected_at, created_at
       FROM manual_payouts
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values
    );

    const total = Number(countRows[0]?.total || 0);

    return sendSuccess(res, {
      payouts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    console.error('Erro ao listar repasses manuais:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao listar repasses manuais', 500);
  }
}

export default withCors(requireInternalRole(handler));

