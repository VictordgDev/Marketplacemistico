import { sendError } from './response.js';

/**
 * Wrap a Vercel Serverless Function handler with CORS headers and error handling.
 * @param {Function} handler - The request handler function
 * @returns {Function} - Wrapped handler
 */
export function withCors(handler) {
  return async function (req, res) {
    // Implementação de cabeçalhos de segurança básicos (estilo Helmet)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Configuração de CORS controlada
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');


    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    try {
      return await handler(req, res);
    } catch (error) {
      console.error('Unhandled error in handler:', error);
      return sendError(res, 'INTERNAL_ERROR', 'Erro interno do servidor', 500);
    }
  };
}
