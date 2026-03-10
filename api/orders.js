import ordersIndex from './_orders/index.js';
import orderDetail from './_orders/[id].js';
import orderStatus from './_orders/[id]/status.js';
import { sendError } from './response.js';

export default async function handler(req, res) {
  const { path, id } = req.query;

  if (!path && !id) return ordersIndex(req, res);
  if (id && !path) return orderDetail(req, res);
  if (id && path === 'status') return orderStatus(req, res);

  return sendError(res, 'NOT_FOUND', 'Endpoint de pedido não encontrado', 404);
}
