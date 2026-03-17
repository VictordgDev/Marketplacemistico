import { withTransaction } from '../../db.js';
import { sanitizeInteger, sanitizeString } from '../../sanitize.js';
import { sendError, sendSuccess } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireInternalRole } from '../../auth-middleware.js';
import { requireFinanceOpsSecret } from '../../finance/ops-auth.js';
import { recordManualPayoutLedgerEntry } from '../../services/finance/ledger-service.js';
import { recordAuditLog } from '../../services/audit/audit-service.js';

const ACTION_TRANSITIONS = {
  approve: {
    from: new Set(['pending']),
    to: 'approved'
  },
  reject: {
    from: new Set(['pending', 'approved']),
    to: 'rejected'
  },
  pay: {
    from: new Set(['approved']),
    to: 'paid'
  }
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const auth = requireFinanceOpsSecret(req, res);
  if (!auth.ok) {
    return undefined;
  }

  const payoutId = sanitizeInteger(req.query?.id);
  const action = sanitizeString(req.body?.action || '').toLowerCase();
  const reason = sanitizeString(req.body?.reason || '');
  const proofUrl = sanitizeString(req.body?.proof_url || '');
  const externalReference = sanitizeString(req.body?.external_reference || '');

  if (!payoutId) {
    return sendError(res, 'VALIDATION_ERROR', 'id do repasse invalido');
  }

  const transition = action === 'approve'
    ? ACTION_TRANSITIONS.approve
    : action === 'reject'
      ? ACTION_TRANSITIONS.reject
      : action === 'pay'
        ? ACTION_TRANSITIONS.pay
        : null;

  if (!transition) {
    return sendError(res, 'VALIDATION_ERROR', 'action deve ser approve, reject ou pay');
  }

  if (action === 'reject' && !reason) {
    return sendError(res, 'VALIDATION_ERROR', 'reason obrigatorio para rejeicao');
  }

  if (action === 'pay' && !externalReference && !proofUrl) {
    return sendError(res, 'VALIDATION_ERROR', 'external_reference ou proof_url obrigatorio para marcar como pago');
  }

  try {
    const result = await withTransaction(async (tx) => {
      const payoutResult = await tx.query(
        `SELECT id, seller_id, order_id, amount, fee_amount, status,
                external_reference, proof_url
         FROM manual_payouts
         WHERE id = $1
         FOR UPDATE`,
        [payoutId]
      );

      if (payoutResult.rows.length === 0) {
        const error = new Error('Repasse manual nao encontrado');
        error.code = 'NOT_FOUND';
        throw error;
      }

      const payout = payoutResult.rows[0];
      if (!transition.from.has(payout.status)) {
        const error = new Error(`Transicao invalida: ${payout.status} -> ${transition.to}`);
        error.code = 'INVALID_TRANSITION';
        throw error;
      }

      const updateResult = await tx.query(
        `UPDATE manual_payouts
         SET status = $2,
             review_reason = COALESCE($3, review_reason),
             proof_url = COALESCE($4, proof_url),
             external_reference = COALESCE($5, external_reference),
             approved_at = CASE WHEN $2 = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
             rejected_at = CASE WHEN $2 = 'rejected' THEN CURRENT_TIMESTAMP ELSE rejected_at END,
             paid_at = CASE WHEN $2 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END
         WHERE id = $1
         RETURNING *`,
        [
          payoutId,
          transition.to,
          reason || null,
          proofUrl || null,
          externalReference || null
        ]
      );

      const updatedPayout = updateResult.rows[0];

      const actionLogResult = await tx.query(
        `INSERT INTO manual_payout_actions (
           manual_payout_id, action, previous_status, new_status,
           reason, proof_url, external_reference, acted_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          payoutId,
          action,
          payout.status,
          transition.to,
          reason || null,
          proofUrl || null,
          externalReference || null,
          req.user.id
        ]
      );

      if (action === 'pay') {
        const paymentRows = await tx.query(
          `SELECT id
           FROM payments
           WHERE order_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [payout.order_id]
        );

        await recordManualPayoutLedgerEntry({
          db: tx,
          orderId: payout.order_id,
          paymentId: paymentRows.rows[0]?.id || null,
          manualPayoutId: payout.id,
          amount: Number(payout.amount || 0)
        });
      }

      await recordAuditLog({
        db: tx,
        actorUserId: req.user.id,
        action: `manual_payout.${action}`,
        resourceType: 'manual_payout',
        resourceId: payout.id,
        before: {
          status: payout.status,
          external_reference: payout.external_reference,
          proof_url: payout.proof_url
        },
        after: {
          status: updatedPayout.status,
          external_reference: updatedPayout.external_reference,
          proof_url: updatedPayout.proof_url
        },
        metadata: {
          reason: reason || null,
          action_log_id: actionLogResult.rows[0]?.id || null
        }
      });

      return {
        payout: updatedPayout,
        actionLog: actionLogResult.rows[0]
      };
    });

    return sendSuccess(res, result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return sendError(res, 'NOT_FOUND', error.message, 404);
    }
    if (error.code === 'INVALID_TRANSITION') {
      return sendError(res, 'INVALID_TRANSITION', error.message, 400);
    }

    console.error('Erro ao executar acao de repasse manual:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao executar operacao de repasse manual', 500);
  }
}

export default withCors(requireInternalRole(handler));

