import { withCors } from '../middleware.js';
import { sendError } from '../response.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  // Tornar a URL de redirecionamento dinâmica para suportar ambientes de teste/preview
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];
  const defaultRedirectUri = `${protocol}://${host}/api/auth/callback/google`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;

  if (!clientId) {
    return sendError(res, 'CONFIG_ERROR', 'GOOGLE_CLIENT_ID não configurado');
  }

  const scope = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=select_account`;

  res.writeHead(302, { Location: googleAuthUrl });
  res.end();
}

export default withCors(handler);
