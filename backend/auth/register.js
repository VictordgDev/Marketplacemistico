import { query } from '../db.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  sanitizeString,
  sanitizeEmail,
  validateEmail,
  sanitizePhone,
  validatePhone,
  validateCpfCnpj,
  validatePassword,
  PASSWORD_STANDARD_MESSAGE
} from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  try {
    let { tipo, nome, email, senha, telefone, cpf_cnpj, nomeLoja, categoria, descricaoLoja } = req.body;

    tipo = sanitizeString(tipo);
    nome = sanitizeString(nome);
    email = sanitizeEmail(email);
    telefone = sanitizePhone(telefone);
    nomeLoja = sanitizeString(nomeLoja);
    categoria = sanitizeString(categoria);
    descricaoLoja = sanitizeString(descricaoLoja);

    if (!tipo || !nome || !email || !senha) {
      return sendError(res, 'VALIDATION_ERROR', 'Campos obrigatorios faltando');
    }

    if (nome.length < 3) {
      return sendError(res, 'VALIDATION_ERROR', 'Nome deve ter ao menos 3 caracteres');
    }

    if (!['cliente', 'vendedor'].includes(tipo)) {
      return sendError(res, 'VALIDATION_ERROR', 'Tipo deve ser "cliente" ou "vendedor"');
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.ok) {
      return sendError(res, 'VALIDATION_ERROR', 'Formato de e-mail invalido');
    }

    const passwordValidation = validatePassword(senha);
    if (!passwordValidation.ok) {
      return sendError(res, 'VALIDATION_ERROR', PASSWORD_STANDARD_MESSAGE);
    }

    const phoneValidation = validatePhone(telefone);
    if (!phoneValidation.ok) {
      return sendError(res, 'VALIDATION_ERROR', phoneValidation.reason);
    }

    const documentValidation = validateCpfCnpj(cpf_cnpj);
    if (!documentValidation.ok) {
      return sendError(res, 'VALIDATION_ERROR', documentValidation.reason);
    }

    if (tipo === 'vendedor' && (!nomeLoja || !categoria)) {
      return sendError(res, 'VALIDATION_ERROR', 'Nome da loja e categoria sao obrigatorios para vendedor');
    }

    const existingEmail = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [emailValidation.value]);
    if (existingEmail.length > 0) {
      return sendError(res, 'EMAIL_TAKEN', 'Email ja cadastrado');
    }

    const existingPhone = await query('SELECT id FROM users WHERE telefone = $1 LIMIT 1', [phoneValidation.value]);
    if (existingPhone.length > 0) {
      return sendError(res, 'PHONE_TAKEN', 'Telefone ja cadastrado');
    }

    const existingDocument = await query('SELECT id FROM users WHERE cpf_cnpj = $1 LIMIT 1', [documentValidation.value]);
    if (existingDocument.length > 0) {
      return sendError(res, 'DOCUMENT_TAKEN', `${documentValidation.type} ja cadastrado`);
    }

    if (tipo === 'vendedor') {
      const existingStore = await query(
        'SELECT id FROM sellers WHERE LOWER(nome_loja) = LOWER($1) LIMIT 1',
        [nomeLoja]
      );
      if (existingStore.length > 0) {
        return sendError(res, 'STORE_NAME_TAKEN', 'Nome da loja ja cadastrado');
      }
    }

    const senhaHash = await bcryptjs.hash(senha, 10);

    const userResult = await query(
      `INSERT INTO users (tipo, nome, email, senha_hash, telefone, cpf_cnpj, tipo_documento)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tipo, nome, email, telefone, cpf_cnpj, tipo_documento`,
      [
        tipo,
        nome,
        emailValidation.value,
        senhaHash,
        phoneValidation.value,
        documentValidation.value,
        documentValidation.type
      ]
    );

    const user = userResult[0];

    if (tipo === 'vendedor') {
      const sellerResult = await query(
        `INSERT INTO sellers (user_id, nome_loja, categoria, descricao_loja)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [user.id, nomeLoja, categoria, descricaoLoja || '']
      );

      user.seller_id = sellerResult[0].id;
      user.nomeLoja = nomeLoja;
      user.categoria = categoria;
      user.descricaoLoja = descricaoLoja || '';
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET nao configurada');

    const token = jwt.sign(
      { id: user.id, email: user.email, tipo: user.tipo },
      secret,
      { expiresIn: '7d' }
    );

    return sendSuccess(
      res,
      {
        message: 'Usuario criado com sucesso',
        token,
        user: {
          id: user.id,
          tipo: user.tipo,
          nome: user.nome,
          email: user.email,
          telefone: user.telefone,
          cpf_cnpj: user.cpf_cnpj,
          seller_id: user.seller_id,
          nomeLoja: user.nomeLoja,
          categoria: user.categoria,
          descricaoLoja: user.descricaoLoja
        }
      },
      201
    );
  } catch (error) {
    console.error('Erro no registro:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao criar usuario', 500);
  }
}

export default withCors(handler);