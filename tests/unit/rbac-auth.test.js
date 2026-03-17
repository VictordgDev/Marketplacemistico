import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { requireInternalRole } from '../../backend/auth-middleware.js';

describe('requireInternalRole middleware', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  function buildRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  }

  test('returns 403 for common user', async () => {
    const token = jwt.sign({ id: 10, email: 'user@x.com', tipo: 'cliente', role: 'user' }, process.env.JWT_SECRET);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = buildRes();

    const handler = requireInternalRole(async (_req, response) => response.status(200).json({ ok: true }));
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('allows operator role', async () => {
    const token = jwt.sign({ id: 11, email: 'ops@x.com', tipo: 'cliente', role: 'operator' }, process.env.JWT_SECRET);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = buildRes();

    const handler = requireInternalRole(async (_req, response) => response.status(200).json({ ok: true }));
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
