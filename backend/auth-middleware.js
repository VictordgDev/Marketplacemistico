import jwt from 'jsonwebtoken';
import { sendError } from './response.js';
import { hasRole, resolveUserRole } from './rbac.js';

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('ERRO CRITICO: JWT_SECRET nao configurada!');
    return null;
  }

  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export function requireAuth(handler) {
  return async function wrappedAuth(req, res) {
    const user = verifyToken(req);
    if (!user) {
      return sendError(res, 'UNAUTHORIZED', 'Token de autenticacao invalido ou ausente', 401);
    }

    req.user = { ...user, role: resolveUserRole(user) };
    return handler(req, res);
  };
}

export function requireVendedor(handler) {
  return requireAuth(async function wrappedVendedor(req, res) {
    if (req.user.tipo !== 'vendedor') {
      return sendError(res, 'FORBIDDEN', 'Acesso restrito a vendedores', 403);
    }
    return handler(req, res);
  });
}

export function requireInternalRole(handler, allowedRoles = ['operator', 'admin']) {
  return requireAuth(async function wrappedInternalRole(req, res) {
    if (!hasRole(req.user.role, allowedRoles)) {
      return sendError(res, 'FORBIDDEN', 'Acesso restrito a operacao interna', 403);
    }
    return handler(req, res);
  });
}
