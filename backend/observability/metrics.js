import { sanitizeString } from '../sanitize.js';
import { sendError, sendSuccess } from '../response.js';
import { withCors } from '../middleware.js';
import { requireInternalRole } from '../auth-middleware.js';
import { getMetricsSnapshot } from './metrics-store.js';

function validateMetricsSecret(req, res) {
  const configured = process.env.METRICS_SECRET;
  if (!configured) {
    return true;
  }

  const provided = sanitizeString(
    req.headers['x-metrics-secret'] ||
    req.query?.metrics_secret ||
    req.body?.metrics_secret
  );

  if (provided !== configured) {
    sendError(res, 'UNAUTHORIZED', 'Acesso de metricas sem autorizacao', 401);
    return false;
  }

  return true;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  if (!validateMetricsSecret(req, res)) {
    return undefined;
  }

  return sendSuccess(res, {
    metrics: getMetricsSnapshot(),
    collected_at: new Date().toISOString()
  });
}

export default withCors(requireInternalRole(handler));
