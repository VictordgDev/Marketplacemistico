import { query } from '../db.js';
import jwt from 'jsonwebtoken';
import { sanitizeString, sanitizeCpfCnpj } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  try {
    // Check current user type
    const users = await query('SELECT tipo FROM users WHERE id = $1', [req.user.id]);

    if (users.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Usuário não encontrado', 404);
    }

    const currentTipo = users[0].tipo;

    if (currentTipo === 'vendedor') {
      return sendError(res, 'ALREADY_VENDOR', 'Você já é um vendedor');
    }

    if (currentTipo !== 'cliente') {
      return sendError(res, 'INVALID_TYPE', 'Apenas clientes podem se tornar vendedores');
    }

    const { nome_loja, categoria, descricao_loja, cpf_cnpj } = req.body;

    const sanitizedNomeLoja = sanitizeString(nome_loja);
    const sanitizedCategoria = sanitizeString(categoria);
    const sanitizedDescricaoLoja = sanitizeString(descricao_loja);
    const sanitizedCpfCnpj = sanitizeCpfCnpj(cpf_cnpj);

    if (!sanitizedNomeLoja || !sanitizedCategoria || !sanitizedCpfCnpj) {
      return sendError(res, 'VALIDATION_ERROR', 'Nome da loja, categoria e CPF/CNPJ são obrigatórios');
    }

    await query(
      'UPDATE users SET tipo = $1, cpf_cnpj = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['vendedor', sanitizedCpfCnpj, req.user.id]
    );

    const sellerResult = await query(
      `INSERT INTO sellers (user_id, nome_loja, categoria, descricao_loja)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.user.id, sanitizedNomeLoja, sanitizedCategoria, sanitizedDescricaoLoja || '']
    );

    const updatedUsers = await query(
      `SELECT u.id, u.tipo, u.nome, u.email, u.telefone, u.cpf_cnpj, u.tipo_documento,
              s.id as seller_id, s.nome_loja, s.categoria, s.descricao_loja
       FROM users u
       LEFT JOIN sellers s ON u.id = s.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const updatedUser = updatedUsers[0];

    const newToken = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, tipo: updatedUser.tipo },
      process.env.JWT_SECRET || 'secret_padrao_mude_isso',
      { expiresIn: '7d' }
    );

    return sendSuccess(res, {
      message: 'Parabéns! Você agora é um vendedor!',
      token: newToken,
      user: updatedUser
    });
  } catch (error) {
    console.error('Erro ao fazer upgrade para vendedor:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao fazer upgrade para vendedor. Tente novamente.', 500);
  }
}

export default withCors(requireAuth(handler));
