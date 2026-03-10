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
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return sendError(res, 'INTERNAL_ERROR', 'Configuração do servidor incompleta', 500);
  }

  try {
    // Verificar token normalmente (sem ignorar expiração)
    // Para implementar um refresh token seguro, deveríamos ter um token de refresh separado
    // armazenado no banco ou em cookie HttpOnly.
    // Como o sistema atual usa apenas um JWT, vamos garantir que ele seja válido.
    const decoded = jwt.verify(token, secret);

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
