import { query } from '../db.js';
import { sanitizeString } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';

function normalizeStatus(providerStatus) {
  const value = sanitizeString(providerStatus || '').toLowerCase();
  if (['approved', 'paid', 'concluded'].includes(value)) return 'approved';
  if (['cancelled', 'canceled', 'rejected'].includes(value)) return 'failed';
  return 'pending';
}

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
    const payload = req.body || {};
    const providerChargeId = sanitizeString(payload.txid || payload.charge_id || payload.id);
    const eventType = sanitizeString(payload.event || payload.type || 'payment_status_changed');
    const status = normalizeStatus(payload.status || payload.situacao);

    if (!providerChargeId) {
      return sendError(res, 'VALIDATION_ERROR', 'provider_charge_id ausente');
    }

    const duplicate = await query(
      `SELECT id FROM webhook_events
       WHERE provider = 'efi' AND external_id = $1 AND event_type = $2
       LIMIT 1`,
      [providerChargeId, eventType]
    );

    if (duplicate.length > 0) {
      return sendSuccess(res, { message: 'Evento ja processado' });
    }

    await query(
      `INSERT INTO webhook_events (provider, event_type, external_id, payload_json, status)
       VALUES ('efi', $1, $2, $3::jsonb, 'received')`,
      [eventType, providerChargeId, JSON.stringify(payload)]
    );

    const payments = await query(
      'SELECT id, order_id FROM payments WHERE provider = $1 AND provider_charge_id = $2 LIMIT 1',
      ['efi', providerChargeId]
    );

    if (payments.length > 0) {
      const payment = payments[0];

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
      }
    }

    await query(
      `UPDATE webhook_events
       SET status = 'processed', processed_at = CURRENT_TIMESTAMP
       WHERE provider = 'efi' AND external_id = $1 AND event_type = $2`,
      [providerChargeId, eventType]
    );

    return sendSuccess(res, { processed: true, providerChargeId, status });
  } catch (error) {
    console.error('Erro no webhook EFI:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar webhook EFI', 500);
  }
}

export default withCors(handler);