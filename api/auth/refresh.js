import jwt from 'jsonwebtoken';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'UNAUTHORIZED', 'Token de autenticação ausente', 401);
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET || 'secret_padrao_mude_isso';

  try {
    // Verify token (ignoring expiration to allow refresh of recently expired tokens)
    const decoded = jwt.verify(token, secret, { ignoreExpiration: true });

    // Only allow refresh within 7 days of expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && now - decoded.exp > 7 * 24 * 60 * 60) {
      return sendError(res, 'TOKEN_EXPIRED', 'Token expirado há mais de 7 dias, faça login novamente', 401);
    }

    const newToken = jwt.sign(
      { id: decoded.id, email: decoded.email, tipo: decoded.tipo },
      secret,
      { expiresIn: '7d' }
    );

    return sendSuccess(res, { token: newToken });
  } catch (error) {
    console.error('Erro ao renovar token:', error);
    return sendError(res, 'INVALID_TOKEN', 'Token inválido', 401);
  }
}

export default withCors(handler);
