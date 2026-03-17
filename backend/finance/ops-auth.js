import { sanitizeString } from '../sanitize.js';
import { sendError } from '../response.js';

export function requireFinanceOpsSecret(req, res) {
  const configured = process.env.FINANCE_OPS_SECRET || process.env.WEBHOOK_OPS_SECRET || process.env.WEBHOOK_REPROCESS_SECRET;
  if (!configured) {
    return { ok: true };
  }

  const provided = sanitizeString(
    req.headers['x-finance-ops-secret'] ||
    req.headers['x-webhook-ops-secret'] ||
    req.body?.ops_secret ||
    req.query?.ops_secret
  );

  if (provided !== configured) {
    sendError(res, 'UNAUTHORIZED', 'Operacao financeira sem autorizacao', 401);
    return { ok: false };
  }

  return { ok: true };
}
