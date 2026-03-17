import { sanitizeInteger } from '../../sanitize.js';
import { sendError, sendSuccess } from '../../response.js';
import { withCors } from '../../middleware.js';
import {
  claimDueFailedEvents,
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

  try {
    const limit = Math.min(100, Math.max(1, sanitizeInteger(req.body?.limit) || 10));
    const claimed = await claimDueFailedEvents({ limit, lockOwner: 'efi_retry_job' });

    const summary = {
      claimed: claimed.length,
      processed: 0,
      failed: 0,
      ignored: 0,
      retryQueued: 0
    };

    for (const event of claimed) {
      try {
        await processEfiWebhookEvent({ eventId: event.id, payload: event.payload_json });
        summary.processed += 1;
      } catch (error) {
        if (error.code === 'INVALID_PAYMENT_STATUS_TRANSITION') {
          await markWebhookIgnored({ eventId: event.id, reason: error.message });
          summary.ignored += 1;
          continue;
        }

        const failure = await markWebhookFailure({
          eventId: event.id,
          errorCode: error.code || 'PROCESSING_ERROR',
          errorMessage: error.message
        });

        if (isRetryableWebhookError(error) && failure?.status === 'failed') {
          summary.retryQueued += 1;
        } else {
          summary.failed += 1;
        }
      }
    }

    return sendSuccess(res, { queue: summary });
  } catch (error) {
    console.error('Erro no job de retry EFI:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao reprocessar fila de webhook EFI', 500);
  }
}

export default withCors(handler);
