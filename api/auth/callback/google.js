import { query } from '../../db.js';
import jwt from 'jsonwebtoken';
import { withCors } from '../../middleware.js';
import { sendError } from '../../response.js';

async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return sendError(res, 'AUTH_ERROR', 'Código de autorização não fornecido');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];

  let redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    redirectUri = `${protocol}://${host}/api/auth/callback/google`;
  }

  try {
    // 1. Trocar o código pelo token de acesso
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Erro ao trocar código por token:', tokenData);
      return sendError(res, 'AUTH_ERROR', 'Erro ao validar código com Google');
    }

    // 2. Obter informações do usuário
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userData = await userResponse.json();

    if (!userData.email) {
      return sendError(res, 'AUTH_ERROR', 'Não foi possível obter o email do Google');
    }

    // 3. Upsert do usuário no banco
    // Verificamos se o usuário já existe pelo google_id ou pelo email
    let users = await query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [userData.id, userData.email]);
    let user;

    if (users.length === 0) {
      // Criar novo usuário
      const insertResult = await query(
        'INSERT INTO users (tipo, nome, email, google_id) VALUES ($1, $2, $3, $4) RETURNING *',
        ['cliente', userData.name, userData.email, userData.id]
      );
      user = insertResult[0];
    } else {
      user = users[0];
      // Atualizar google_id se estiver faltando ou nome se mudou
      if (!user.google_id || user.nome !== userData.name) {
        await query('UPDATE users SET google_id = $1, nome = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [userData.id, userData.name, user.id]);
        user.google_id = userData.id;
        user.nome = userData.name;
      }
    }

    // 4. Gerar JWT
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurada');

    const token = jwt.sign(
      { id: user.id, email: user.email, tipo: user.tipo },
      secret,
      { expiresIn: '7d' }
    );

    // 5. Redirecionar de volta para o frontend com o token
    // Como é um monorepo e o front está na /public servido na root
    const defaultFrontendUrl = `${protocol}://${host}`;
    const frontendUrl = process.env.FRONTEND_URL || defaultFrontendUrl;

    // Pegar informações extras para o frontend (vendedor)
    let sellerInfo = {};
    if (user.tipo === 'vendedor') {
        const sellers = await query('SELECT * FROM sellers WHERE user_id = $1', [user.id]);
        if (sellers.length > 0) {
            sellerInfo = {
                seller_id: sellers[0].id,
                nomeLoja: sellers[0].nome_loja,
                categoria: sellers[0].categoria,
                descricaoLoja: sellers[0].descricao_loja
            };
        }
    }

    const userDataParam = encodeURIComponent(JSON.stringify({
        id: user.id,
        tipo: user.tipo,
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        cpf_cnpj: user.cpf_cnpj,
        ...sellerInfo
    }));

    res.writeHead(302, {
      Location: `${frontendUrl}/?token=${token}&user=${userDataParam}`
    });
    res.end();

  } catch (error) {
    console.error('Erro no callback do Google:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro interno no processamento do login Google', 500);
  }
}

export default withCors(handler);
