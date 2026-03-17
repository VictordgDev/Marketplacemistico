import { sanitizeString } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import {
  claimWebhookEventByKey,
  extractEfiEvent,
  isRetryableWebhookError,
  markWebhookFailure,
  markWebhookIgnored,
  processEfiWebhookEvent
} from '../services/webhooks/efi-webhook-processor.js';

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

  const payload = req.body || {};
  const event = extractEfiEvent(payload);

  if (!event.providerChargeId) {
    return sendError(res, 'VALIDATION_ERROR', 'provider_charge_id ausente');
  }

  try {
    const claim = await claimWebhookEventByKey({
      provider: 'efi',
      providerChargeId: event.providerChargeId,
      eventType: event.eventType,
      payload,
      lockOwner: 'efi_webhook'
    });

    if (!claim.claimed) {
      if (claim.reason === 'processing') {
        return sendSuccess(res, { message: 'Evento em processamento' });
      }
      return sendSuccess(res, { message: 'Evento ja processado' });
    }

    const result = await processEfiWebhookEvent({ eventId: claim.event.id, payload });
    return sendSuccess(res, result);
  } catch (error) {
    const eventType = sanitizeString(event.eventType || 'payment_status_changed');

    if (error.code === 'INVALID_PAYMENT_STATUS_TRANSITION') {
      const claim = await claimWebhookEventByKey({
        provider: 'efi',
        providerChargeId: event.providerChargeId,
        eventType,
        payload,
        lockOwner: 'efi_webhook_invalid_transition'
      });

      if (claim.claimed) {
        await markWebhookIgnored({ eventId: claim.event.id, reason: error.message });
      }

      return sendSuccess(res, {
        processed: false,
        reason: error.code,
        message: error.message
      });
    }

    const claim = await claimWebhookEventByKey({
      provider: 'efi',
      providerChargeId: event.providerChargeId,
      eventType,
      payload,
      lockOwner: 'efi_webhook_failure'
    });

    if (claim.claimed) {
      const failureResult = await markWebhookFailure({
        eventId: claim.event.id,
        errorCode: error.code || 'PROCESSING_ERROR',
        errorMessage: error.message
      });

      if (isRetryableWebhookError(error)) {
        return sendSuccess(res, {
          processed: false,
          queuedForRetry: true,
          reason: error.code,
          retryCount: failureResult?.retry_count,
          maxRetries: failureResult?.max_retries,
          nextRetryAt: failureResult?.next_retry_at || null
        });
      }
    }

    console.error('Erro no webhook EFI:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar webhook EFI', 500);
  }
}

export default withCors(handler);
