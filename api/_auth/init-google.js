import { withCors } from '../../middleware.js';
import { sendError } from '../../response.js';

async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return sendError(res, 'CONFIG_ERROR', 'GOOGLE_CLIENT_ID não configurada');
  }

  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];

  let redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    redirectUri = `${protocol}://${host}/api/auth/callback/google`;
  }

  const scope = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=online`;

  res.writeHead(302, { Location: authUrl });
  res.end();
}

export default withCors(handler);
