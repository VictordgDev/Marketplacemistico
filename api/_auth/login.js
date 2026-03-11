import { query } from '../db.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sanitizeEmail } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  console.log('🔑 Tentativa de login...');

  try {
    let { email, senha } = req.body;

    email = sanitizeEmail(email);

    if (!email || !senha) {
      return sendError(res, 'VALIDATION_ERROR', 'Email e senha são obrigatórios');
    }

    console.log('🔍 Buscando usuário:', email);
    const users = await query(
      `SELECT u.*, s.id as seller_id, s.nome_loja, s.categoria, s.descricao_loja
       FROM users u
       LEFT JOIN sellers s ON u.id = s.user_id
       WHERE u.email = $1`,
      [email]
    );

    if (users.length === 0) {
      console.log('❌ Usuário não encontrado');
      return sendError(res, 'INVALID_CREDENTIALS', 'Email ou senha incorretos', 401);
    }

    const user = users[0];
    console.log('✅ Usuário encontrado:', user.nome);

    console.log('🔐 Verificando senha...');
    const senhaValida = await bcryptjs.compare(senha, user.senha_hash);

    if (!senhaValida) {
      console.log('❌ Senha incorreta');
      return sendError(res, 'INVALID_CREDENTIALS', 'Email ou senha incorretos', 401);
    }

    console.log('✅ Senha válida');

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurada');

    const token = jwt.sign(
      { id: user.id, email: user.email, tipo: user.tipo },
      secret,
      { expiresIn: '7d' }
    );

    let endereco = null;
    if (user.tipo === 'cliente') {
      const addresses = await query(
        'SELECT * FROM addresses WHERE user_id = $1 AND is_default = true LIMIT 1',
        [user.id]
      );
      if (addresses.length > 0) {
        endereco = addresses[0];
      }
    }

    console.log('🎉 Login bem-sucedido!');
    return sendSuccess(res, {
      token,
      user: {
        id: user.id,
        tipo: user.tipo,
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        cpf_cnpj: user.cpf_cnpj,
        seller_id: user.seller_id,
        nomeLoja: user.nome_loja,
        categoria: user.categoria,
        descricaoLoja: user.descricao_loja,
        endereco
      }
    });
  } catch (error) {
    console.error('💥 ERRO NO LOGIN:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao fazer login', 500);
  }
}

export default withCors(handler);
