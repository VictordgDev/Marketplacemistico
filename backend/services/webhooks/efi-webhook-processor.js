import { query } from '../../db.js';
import { sanitizeString } from '../../sanitize.js';
import {
  assertPaymentStatusTransition,
  normalizePaymentStatus
} from '../payments/payment-status-machine.js';

const RETRYABLE_CODES = new Set(['PAYMENT_NOT_FOUND', 'EVENT_NOT_CLAIMED']);

function normalizePayload(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload;
}

function getEventKey(payload) {
  const safePayload = normalizePayload(payload);
  const providerChargeId = sanitizeString(safePayload.txid || safePayload.charge_id || safePayload.id);
  const eventType = sanitizeString(safePayload.event || safePayload.type || 'payment_status_changed');
  const status = normalizePaymentStatus(safePayload.status || safePayload.situacao);

  return {
    payload: safePayload,
    providerChargeId,
    eventType,
    status
  };
}

export async function claimWebhookEventByKey({ provider, providerChargeId, eventType, payload, lockOwner }) {
  const insert = await query(
    `INSERT INTO webhook_events (
       provider, event_type, external_id, payload_json, status,
       retry_count, max_retries, next_retry_at, last_error, locked_at, locked_by
     )
     VALUES ($1, $2, $3, $4::jsonb, 'processing', 0, 5, NULL, NULL, CURRENT_TIMESTAMP, $5)
     ON CONFLICT (provider, external_id, event_type)
     WHERE external_id IS NOT NULL AND event_type IS NOT NULL
     DO NOTHING
     RETURNING id, status, retry_count, max_retries, payload_json`,
    [provider, eventType, providerChargeId, JSON.stringify(payload || {}), lockOwner || null]
  );

  if (insert.length > 0) {
    return { claimed: true, event: insert[0], reason: 'inserted' };
  }

  const existingRows = await query(
    `SELECT id, status, retry_count, max_retries, payload_json
     FROM webhook_events
     WHERE provider = $1 AND external_id = $2 AND event_type = $3
     LIMIT 1`,
    [provider, providerChargeId, eventType]
  );

  if (existingRows.length === 0) {
    return { claimed: false, reason: 'not_found' };
  }

  const existing = existingRows[0];
  if (['processed', 'ignored'].includes(existing.status)) {
    return { claimed: false, reason: existing.status, event: existing };
  }

  const claimedRows = await query(
    `UPDATE webhook_events
     SET status = 'processing',
         payload_json = $2::jsonb,
         locked_at = CURRENT_TIMESTAMP,
         locked_by = $3,
         last_error = NULL
     WHERE id = $1
       AND status IN ('failed', 'received')
     RETURNING id, status, retry_count, max_retries, payload_json`,
    [existing.id, JSON.stringify(payload || {}), lockOwner || null]
  );

  if (claimedRows.length === 0) {
    return { claimed: false, reason: 'processing', event: existing };
  }

  return { claimed: true, event: claimedRows[0], reason: 'reclaimed' };
}

export async function claimWebhookEventById({ eventId, force = false, lockOwner = 'manual_reprocess' }) {
  const claimedRows = await query(
    `UPDATE webhook_events
     SET status = 'processing',
         locked_at = CURRENT_TIMESTAMP,
         locked_by = $3,
         last_error = NULL
     WHERE id = $1
       AND provider = 'efi'
       AND (
         status IN ('failed', 'received')
         OR ($2::boolean = true AND status IN ('ignored', 'processed'))
       )
     RETURNING id, status, retry_count, max_retries, payload_json`,
    [eventId, force, lockOwner]
  );

  if (claimedRows.length > 0) {
    return { claimed: true, event: claimedRows[0] };
  }

  const existing = await query(
    'SELECT id, status, retry_count, max_retries, payload_json FROM webhook_events WHERE id = $1 AND provider = $2 LIMIT 1',
    [eventId, 'efi']
  );

  if (existing.length === 0) {
    return { claimed: false, reason: 'not_found' };
  }

  return { claimed: false, reason: existing[0].status, event: existing[0] };
}

export async function claimDueFailedEvents({ limit = 10, lockOwner = 'retry_job' }) {
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 10;

  return query(
    `WITH due AS (
      SELECT id
      FROM webhook_events
      WHERE provider = 'efi'
        AND status = 'failed'
        AND retry_count < max_retries
        AND COALESCE(next_retry_at, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
      ORDER BY next_retry_at NULLS FIRST, id
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE webhook_events w
    SET status = 'processing',
        locked_at = CURRENT_TIMESTAMP,
        locked_by = $2,
        last_error = NULL
    FROM due
    WHERE w.id = due.id
    RETURNING w.id, w.status, w.retry_count, w.max_retries, w.payload_json`,
    [safeLimit, lockOwner]
  );
}

export async function processEfiWebhookEvent({ eventId, payload }) {
  const eventKey = getEventKey(payload);

  if (!eventKey.providerChargeId) {
    const error = new Error('provider_charge_id ausente');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const payments = await query(
    'SELECT id, order_id, status FROM payments WHERE provider = $1 AND provider_charge_id = $2 LIMIT 1',
    ['efi', eventKey.providerChargeId]
  );

  if (payments.length === 0) {
    const error = new Error(`Pagamento nao encontrado para charge ${eventKey.providerChargeId}`);
    error.code = 'PAYMENT_NOT_FOUND';
    throw error;
  }

  const payment = payments[0];
  const currentStatus = normalizePaymentStatus(payment.status);
  assertPaymentStatusTransition(currentStatus, eventKey.status);

  await query(
    `UPDATE payments
     SET status = $1,
         paid_at = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE paid_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [eventKey.status, payment.id]
  );

  if (eventKey.status === 'approved') {
    await query(
      `UPDATE orders
       SET payment_status = 'approved',
           status = CASE WHEN status = 'pendente' THEN 'confirmado' ELSE status END
       WHERE id = $1`,
      [payment.order_id]
    );
  } else if (['failed', 'cancelled', 'refunded', 'partially_refunded'].includes(eventKey.status)) {
    await query(
      `UPDATE orders
       SET payment_status = $1,
           status = CASE
             WHEN $1 IN ('failed', 'cancelled') AND status = 'pendente' THEN 'cancelado'
             ELSE status
           END
       WHERE id = $2`,
      [eventKey.status, payment.order_id]
    );
  }

  await query(
    `UPDATE webhook_events
     SET status = 'processed',
         processed_at = CURRENT_TIMESTAMP,
         next_retry_at = NULL,
         last_error = NULL,
         locked_at = NULL,
         locked_by = NULL
     WHERE id = $1`,
    [eventId]
  );

  return {
    processed: true,
    providerChargeId: eventKey.providerChargeId,
    eventType: eventKey.eventType,
    status: eventKey.status
  };
}

export async function markWebhookIgnored({ eventId, reason }) {
  await query(
    `UPDATE webhook_events
     SET status = 'ignored',
         processed_at = CURRENT_TIMESTAMP,
         last_error = LEFT($2, 1000),
         next_retry_at = NULL,
         locked_at = NULL,
         locked_by = NULL
     WHERE id = $1`,
    [eventId, sanitizeString(reason || 'ignored')]
  );
}

export async function markWebhookFailure({ eventId, errorCode, errorMessage }) {
  const code = sanitizeString(errorCode || 'PROCESSING_ERROR');
  const message = sanitizeString(errorMessage || 'Falha no processamento do webhook');

  const result = await query(
    `UPDATE webhook_events
     SET retry_count = retry_count + 1,
         status = CASE WHEN retry_count + 1 >= max_retries THEN 'ignored' ELSE 'failed' END,
         last_error = LEFT($2, 1000),
         next_retry_at = CASE
           WHEN retry_count + 1 >= max_retries THEN NULL
           ELSE CURRENT_TIMESTAMP + (LEAST(60, POWER(2, GREATEST(retry_count, 0))::int) * INTERVAL '1 minute')
         END,
         processed_at = CASE WHEN retry_count + 1 >= max_retries THEN CURRENT_TIMESTAMP ELSE processed_at END,
         locked_at = NULL,
         locked_by = NULL
     WHERE id = $1
     RETURNING id, status, retry_count, max_retries, next_retry_at`,
    [eventId, `${code}: ${message}`]
  );

  return result[0] || null;
}

export function isRetryableWebhookError(error) {
  return Boolean(error && RETRYABLE_CODES.has(error.code));
}

export function extractEfiEvent(payload) {
  return getEventKey(payload);
}
