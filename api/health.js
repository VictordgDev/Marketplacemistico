import { query } from './db.js';
import { sendSuccess, sendError } from './response.js';
import { withCors } from './middleware.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  let dbStatus = 'disconnected';
  try {
    await query('SELECT 1');
    dbStatus = 'connected';
  } catch (err) {
    console.error('Health check DB error:', err);
  }

  const version = '1.0.0';

  return sendSuccess(res, {
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    version
  });
}

export default withCors(handler);
