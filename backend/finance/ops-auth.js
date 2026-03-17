import { sanitizeString } from '../sanitize.js';
import { sendError } from '../response.js';
import { isInternalRole } from '../rbac.js';

export function requireFinanceOpsSecret(req, res) {
  if (!req.user || !isInternalRole(req.user.role)) {
    sendError(res, 'FORBIDDEN', 'Acesso restrito a operador/admin', 403);
    return { ok: false };
  }

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
