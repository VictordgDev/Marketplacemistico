import { sanitizeString } from '../../sanitize.js';
import { sendError } from '../../response.js';

export function requireWebhookOpsSecret(req, res) {
  const configuredSecret = process.env.WEBHOOK_REPROCESS_SECRET || process.env.WEBHOOK_OPS_SECRET;
  if (!configuredSecret) {
    return { ok: true };
  }

  const provided = sanitizeString(
    req.headers['x-webhook-ops-secret'] ||
    req.headers['x-admin-secret'] ||
    req.query?.ops_secret ||
    req.body?.ops_secret
  );

  if (provided !== configuredSecret) {
    sendError(res, 'UNAUTHORIZED', 'Operacao de webhook sem autorizacao', 401);
    return { ok: false };
  }

  return { ok: true };
}
