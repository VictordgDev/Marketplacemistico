import { query } from '../db.js';
import { sanitizeString } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import {
  assertPaymentStatusTransition,
  normalizePaymentStatus
} from '../services/payments/payment-status-machine.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const webhookSecret = process.env.EFI_WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = req.headers['x-webhook-secret'];
    if (receivedSecret !== webhookSecret) {
      return sendError(res, 'UNAUTHORIZED', 'Webhook sem autorizacao', 401);
    }
  }

  try {
    let webhookEventId = null;
    const payload = req.body || {};
    const providerChargeId = sanitizeString(payload.txid || payload.charge_id || payload.id);
    const eventType = sanitizeString(payload.event || payload.type || 'payment_status_changed');
    const status = normalizePaymentStatus(payload.status || payload.situacao);

    if (!providerChargeId) {
      return sendError(res, 'VALIDATION_ERROR', 'provider_charge_id ausente');
    }

    const eventInsert = await query(
      `INSERT INTO webhook_events (provider, event_type, external_id, payload_json, status)
       VALUES ('efi', $1, $2, $3::jsonb, 'processing')
       ON CONFLICT (provider, external_id, event_type)
       WHERE external_id IS NOT NULL AND event_type IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [eventType, providerChargeId, JSON.stringify(payload)]
    );

    if (eventInsert.length === 0) {
      return sendSuccess(res, { message: 'Evento ja processado' });
    }
    webhookEventId = eventInsert[0].id;

    const payments = await query(
      'SELECT id, order_id, status FROM payments WHERE provider = $1 AND provider_charge_id = $2 LIMIT 1',
      ['efi', providerChargeId]
    );

    if (payments.length > 0) {
      const payment = payments[0];
      const currentStatus = normalizePaymentStatus(payment.status);

      assertPaymentStatusTransition(currentStatus, status);

      await query(
        `UPDATE payments
         SET status = $1,
             paid_at = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE paid_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [status, payment.id]
      );

      if (status === 'approved') {
        await query(
          `UPDATE orders
           SET payment_status = 'approved',
               status = CASE WHEN status = 'pendente' THEN 'confirmado' ELSE status END
           WHERE id = $1`,
          [payment.order_id]
        );
      } else if (['failed', 'cancelled', 'refunded', 'partially_refunded'].includes(status)) {
        await query(
          `UPDATE orders
           SET payment_status = $1,
               status = CASE
                 WHEN $1 IN ('failed', 'cancelled') AND status = 'pendente' THEN 'cancelado'
                 ELSE status
               END
           WHERE id = $2`,
          [status, payment.order_id]
        );
      }
    }

    await query(
      `UPDATE webhook_events
       SET status = 'processed', processed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [webhookEventId]
    );

    return sendSuccess(res, { processed: true, providerChargeId, status });
  } catch (error) {
    if (error.code === 'INVALID_PAYMENT_STATUS_TRANSITION') {
      try {
        const payload = req.body || {};
        const providerChargeId = sanitizeString(payload.txid || payload.charge_id || payload.id);
        const eventType = sanitizeString(payload.event || payload.type || 'payment_status_changed');
        await query(
          `UPDATE webhook_events
           SET status = 'ignored', processed_at = CURRENT_TIMESTAMP
           WHERE provider = 'efi' AND external_id = $1 AND event_type = $2`,
          [providerChargeId, eventType]
        );
      } catch (ignoredUpdateError) {
        console.error('Erro ao marcar webhook ignorado:', ignoredUpdateError);
      }
      return sendSuccess(res, { processed: false, reason: error.code, message: error.message });
    }

    try {
      const payload = req.body || {};
      const providerChargeId = sanitizeString(payload.txid || payload.charge_id || payload.id);
      const eventType = sanitizeString(payload.event || payload.type || 'payment_status_changed');
      await query(
        `UPDATE webhook_events
         SET status = 'failed', processed_at = CURRENT_TIMESTAMP
         WHERE provider = 'efi' AND external_id = $1 AND event_type = $2`,
        [providerChargeId, eventType]
      );
    } catch (failedUpdateError) {
      console.error('Erro ao marcar webhook com falha:', failedUpdateError);
    }

    console.error('Erro no webhook EFI:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar webhook EFI', 500);
  }
}

export default withCors(handler);
