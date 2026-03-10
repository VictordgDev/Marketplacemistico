import jwt from 'jsonwebtoken';
import { sendError } from './response.js';

/**
 * Verify JWT token from Authorization header.
 * @param {object} req - Request object
 * @returns {object|null} - Decoded token payload or null
 */
function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('ERRO CRÍTICO: JWT_SECRET não configurada!');
    return null;
  }
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

/**
 * Middleware that requires a valid JWT. Injects req.user = { id, email, tipo }.
 * Returns 401 if token is missing/invalid.
 * @param {Function} handler
 * @returns {Function}
 */
export function requireAuth(handler) {
  return async function (req, res) {
    const user = verifyToken(req);
    if (!user) {
      return sendError(res, 'UNAUTHORIZED', 'Token de autenticação inválido ou ausente', 401);
    }
    req.user = user;
    return handler(req, res);
  };
}

/**
 * Middleware that requires a valid JWT AND that the user is a 'vendedor'.
 * Returns 401 if unauthenticated, 403 if not a vendor.
 * @param {Function} handler
 * @returns {Function}
 */
export function requireVendedor(handler) {
  return requireAuth(async function (req, res) {
    if (req.user.tipo !== 'vendedor') {
      return sendError(res, 'FORBIDDEN', 'Acesso restrito a vendedores', 403);
    }
    return handler(req, res);
  });
}
