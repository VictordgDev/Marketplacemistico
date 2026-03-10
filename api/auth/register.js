import { query } from '../db.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sanitizeString, sanitizeEmail, sanitizePhone, sanitizeCpfCnpj } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
  }

  console.log('📝 Iniciando registro de usuário...');

  try {
    let { tipo, nome, email, senha, telefone, cpf_cnpj, nomeLoja, categoria, descricaoLoja } = req.body;

    // Sanitize all inputs
    tipo = sanitizeString(tipo);
    nome = sanitizeString(nome);
    email = sanitizeEmail(email);
    telefone = sanitizePhone(telefone);
    cpf_cnpj = sanitizeCpfCnpj(cpf_cnpj);
    nomeLoja = sanitizeString(nomeLoja);
    categoria = sanitizeString(categoria);
    descricaoLoja = sanitizeString(descricaoLoja);

    // Validate required fields
    if (!tipo || !nome || !email || !senha) {
      console.log('❌ Campos obrigatórios faltando');
      return sendError(res, 'VALIDATION_ERROR', 'Campos obrigatórios faltando');
    }

    if (nome.length < 3) {
      return sendError(res, 'VALIDATION_ERROR', 'Nome deve ter ao menos 3 caracteres');
    }

    if (!['cliente', 'vendedor'].includes(tipo)) {
      return sendError(res, 'VALIDATION_ERROR', 'Tipo deve ser "cliente" ou "vendedor"');
    }

    // Require telefone and cpf_cnpj for all users
    if (!telefone || !cpf_cnpj) {
      console.log('❌ Telefone e CPF/CNPJ são obrigatórios');
      return sendError(res, 'VALIDATION_ERROR', 'Telefone e CPF/CNPJ são obrigatórios para completar o perfil');
    }

    console.log('✅ Validação inicial OK');

    console.log('🔍 Verificando se email existe...');
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);

    if (existingUser.length > 0) {
      console.log('❌ Email já cadastrado');
      return sendError(res, 'EMAIL_TAKEN', 'Email já cadastrado');
    }

    console.log('✅ Email disponível');

    console.log('🔐 Gerando hash da senha...');
    const senhaHash = await bcryptjs.hash(senha, 10);
    console.log('✅ Hash gerado');

    let tipoDocumento = null;
    if (cpf_cnpj) {
      const numbers = cpf_cnpj.replace(/\D/g, '');
      tipoDocumento = numbers.length === 11 ? 'CPF' : 'CNPJ';
    }

    console.log('💾 Inserindo usuário no banco...');
    const userResult = await query(
      `INSERT INTO users (tipo, nome, email, senha_hash, telefone, cpf_cnpj, tipo_documento)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tipo, nome, email, telefone`,
      [tipo, nome, email, senhaHash, telefone, cpf_cnpj, tipoDocumento]
    );

    console.log('✅ Usuário inserido:', userResult);
    const user = userResult[0];

    if (tipo === 'vendedor') {
      console.log('🏪 Criando registro de vendedor...');
      const sellerResult = await query(
        `INSERT INTO sellers (user_id, nome_loja, categoria, descricao_loja)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [user.id, nomeLoja, categoria, descricaoLoja]
      );
      console.log('✅ Vendedor criado:', sellerResult);
      user.seller_id = sellerResult[0].id;
      user.nomeLoja = nomeLoja;
    }

    console.log('🎉 Registro concluído com sucesso!');

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurada');

    const token = jwt.sign(
      { id: user.id, email: user.email, tipo: user.tipo },
      secret,
      { expiresIn: '7d' }
    );

    return sendSuccess(res, {
      message: 'Usuário criado com sucesso',
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
        descricaoLoja: user.descricao_loja
      }
    }, 201);
  } catch (error) {
    console.error('💥 ERRO NO REGISTRO:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao criar usuário', 500);
  }
}

export default withCors(handler);
