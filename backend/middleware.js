import { randomUUID } from 'node:crypto';
import { sendError } from './response.js';
import { logError, logInfo } from './observability/logger.js';
import { incrementMetric } from './observability/metrics-store.js';

export function withCors(handler) {
  return async function wrappedWithCors(req, res) {
    const startedAt = Date.now();
    const incomingCorrelationId = req.headers['x-correlation-id'];
    const correlationId = String(incomingCorrelationId || randomUUID());

    req.correlationId = correlationId;

    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    incrementMetric('http.requests.total', { method: req.method });
    logInfo('http.request.start', {
      correlation_id: correlationId,
      method: req.method,
      path: req.url
    });

    try {
      const result = await handler(req, res);

      incrementMetric('http.requests.success', {
        method: req.method,
        status: res.statusCode || 200
      });

      logInfo('http.request.end', {
        correlation_id: correlationId,
        method: req.method,
        path: req.url,
        status: res.statusCode || 200,
        duration_ms: Date.now() - startedAt
      });

      return result;
    } catch (error) {
      incrementMetric('http.requests.error', { method: req.method });
      logError('http.request.error', error, {
        correlation_id: correlationId,
        method: req.method,
        path: req.url,
        duration_ms: Date.now() - startedAt
      });
      return sendError(res, 'INTERNAL_ERROR', 'Erro interno do servidor', 500);
    }
  };
}
