import productsIndex from './_products/index.js';
import productDetail from './_products/[id].js';
import productPublish from './_products/[id]/publish.js';
import { sendError } from './response.js';

export default async function handler(req, res) {
  const { path, id } = req.query;

  if (!path && !id) return productsIndex(req, res);
  if (id && !path) return productDetail(req, res);
  if (id && path === 'publish') return productPublish(req, res);

  return sendError(res, 'NOT_FOUND', 'Endpoint de produto não encontrado', 404);
}
