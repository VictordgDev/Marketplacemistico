import { sanitizeBoolean, sanitizeInteger } from '../../sanitize.js';
import { sendError, sendSuccess } from '../../response.js';
import { withCors } from '../../middleware.js';
import {
  claimWebhookEventById,
  isRetryableWebhookError,
  markWebhookFailure,
  markWebhookIgnored,
  processEfiWebhookEvent
} from '../../services/webhooks/efi-webhook-processor.js';
import { requireWebhookOpsSecret } from './_ops-auth.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const auth = requireWebhookOpsSecret(req, res);
  if (!auth.ok) {
    return undefined;
  }

  const eventId = sanitizeInteger(req.body?.event_id || req.query?.event_id);
  const force = sanitizeBoolean(req.body?.force || req.query?.force);

  if (!eventId) {
    return sendError(res, 'VALIDATION_ERROR', 'event_id obrigatorio');
  }

  try {
    const claim = await claimWebhookEventById({ eventId, force, lockOwner: 'manual_reprocess' });
    if (!claim.claimed) {
      if (claim.reason === 'not_found') {
        return sendError(res, 'NOT_FOUND', 'Evento de webhook nao encontrado', 404);
      }

      return sendSuccess(res, {
        processed: false,
        message: 'Evento nao elegivel para reprocessamento',
        status: claim.reason
      });
    }

    const result = await processEfiWebhookEvent({ eventId, payload: claim.event.payload_json });
    return sendSuccess(res, { processed: true, event_id: eventId, result });
  } catch (error) {
    if (error.code === 'INVALID_PAYMENT_STATUS_TRANSITION') {
      await markWebhookIgnored({ eventId, reason: error.message });
      return sendSuccess(res, { processed: false, reason: error.code, message: error.message });
    }

    const failure = await markWebhookFailure({
      eventId,
      errorCode: error.code || 'PROCESSING_ERROR',
      errorMessage: error.message
    });

    return sendSuccess(res, {
      processed: false,
      reason: error.code || 'PROCESSING_ERROR',
      retryable: isRetryableWebhookError(error),
      status: failure?.status || 'failed',
      retryCount: failure?.retry_count,
      maxRetries: failure?.max_retries,
      nextRetryAt: failure?.next_retry_at || null
    });
  }
}

export default withCors(handler);
