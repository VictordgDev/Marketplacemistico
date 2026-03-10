import sellerMe from './_sellers/me.js';
import sellerDetail from './_sellers/[id].js';
import sellerOrders from './_sellers/me/orders.js';
import sellerProducts from './_sellers/me/products.js';
import { sendError } from './response.js';

export default async function handler(req, res) {
  const { path, id } = req.query;

  if (path === 'me' && !id) return sellerMe(req, res);
  if (path === 'me/orders') return sellerOrders(req, res);
  if (path === 'me/products') return sellerProducts(req, res);
  if (id) return sellerDetail(req, res);

  return sendError(res, 'NOT_FOUND', 'Endpoint de vendedor não encontrado', 404);
}
