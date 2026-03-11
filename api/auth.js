import login from './_auth/login.js';
import register from './_auth/register.js';
import initGoogle from './_auth/init-google.js';
import googleCallback from './_auth/google.js';
import me from './_auth/me.js';
import refresh from './_auth/refresh.js';
import { sendError } from './response.js';

export default async function handler(req, res) {
  const { path } = req.query;

  if (path === 'login') return login(req, res);
  if (path === 'register') return register(req, res);
  if (path === 'google') return initGoogle(req, res);
  if (path === 'callback/google') return googleCallback(req, res);
  if (path === 'me') return me(req, res);
  if (path === 'refresh') return refresh(req, res);

  return sendError(res, 'NOT_FOUND', 'Endpoint de autenticação não encontrado', 404);
}
