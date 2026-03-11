import profile from './_users/profile.js';
import upgradeToVendor from './_users/upgrade-to-vendor.js';
import addresses from './_users/index.js';
import addressDetail from './_users/[id].js';
import { sendError } from './response.js';

export default async function handler(req, res) {
  const { path, id } = req.query;

  if (path === 'profile') return profile(req, res);
  if (path === 'upgrade-to-vendor') return upgradeToVendor(req, res);
  if (path === 'addresses' && !id) return addresses(req, res);
  if (path === 'addresses' && id) return addressDetail(req, res);

  return sendError(res, 'NOT_FOUND', 'Endpoint de usuário não encontrado', 404);
}
