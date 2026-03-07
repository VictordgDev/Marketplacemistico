import { query } from '../db.js';
import { sanitizeString, sanitizeNumber, sanitizeInteger, sanitizeUrl, sanitizeBoolean } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireVendedor } from '../auth-middleware.js';

async function getHandler(req, res) {
  const { categoria, seller_id, search, page: rawPage, limit: rawLimit } = req.query;

  const page = Math.max(1, sanitizeInteger(rawPage) || 1);
  const limit = Math.min(100, Math.max(1, sanitizeInteger(rawLimit) || 20));
  const offset = (page - 1) * limit;

  let baseQuery = `
    FROM products p
    JOIN sellers s ON p.seller_id = s.id
    WHERE p.publicado = true
  `;
  const params = [];
  let paramCount = 1;

  if (categoria && categoria !== 'Todos') {
    baseQuery += ` AND p.categoria = $${paramCount}`;
    params.push(sanitizeString(categoria));
    paramCount++;
  }

  if (seller_id) {
    baseQuery += ` AND s.id = $${paramCount}`;
    params.push(sanitizeInteger(seller_id));
    paramCount++;
  }

  if (search) {
    baseQuery += ` AND (p.nome ILIKE $${paramCount} OR p.descricao ILIKE $${paramCount})`;
    params.push(`%${sanitizeString(search)}%`);
    paramCount++;
  }

  try {
    const countResult = await query(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = parseInt(countResult[0].total, 10);

    const dataParams = [...params, limit, offset];
    const products = await query(
      `SELECT p.id, p.nome, p.categoria, p.descricao, p.preco, p.estoque, p.imagem_url, p.publicado, p.created_at,
              s.id as seller_id, s.nome_loja, s.avaliacao_media
       ${baseQuery}
       ORDER BY p.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      dataParams
    );

    return sendSuccess(res, {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao buscar produtos', 500);
  }
}

async function postHandler(req, res) {
  const sellers = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
  if (sellers.length === 0) {
    return sendError(res, 'NOT_FOUND', 'Vendedor não encontrado', 404);
  }
  const sellerId = sellers[0].id;

  let { nome, categoria, descricao, preco, estoque, imagemUrl, publicado } = req.body;

  nome = sanitizeString(nome);
  categoria = sanitizeString(categoria);
  descricao = sanitizeString(descricao);
  preco = sanitizeNumber(preco);
  estoque = sanitizeInteger(estoque);
  imagemUrl = sanitizeUrl(imagemUrl);
  publicado = sanitizeBoolean(publicado);

  if (!nome || !categoria || preco === null) {
    return sendError(res, 'VALIDATION_ERROR', 'Campos obrigatórios faltando (nome, categoria, preco)');
  }

  if (estoque === null || estoque < 0) {
    estoque = 0;
  }

  try {
    const result = await query(
      `INSERT INTO products (seller_id, nome, categoria, descricao, preco, estoque, imagem_url, publicado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [sellerId, nome, categoria, descricao, preco, estoque, imagemUrl || '', publicado]
    );

    console.log('✅ Produto criado:', result);
    return sendSuccess(res, { product: result[0] }, 201);
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao criar produto', 500);
  }
}

async function handler(req, res) {
  if (req.method === 'GET') {
    return getHandler(req, res);
  }
  if (req.method === 'POST') {
    return requireVendedor(postHandler)(req, res);
  }
  return sendError(res, 'METHOD_NOT_ALLOWED', 'Método não permitido', 405);
}

export default withCors(handler);
