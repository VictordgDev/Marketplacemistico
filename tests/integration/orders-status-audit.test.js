import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 201, tipo: 'vendedor' };
    return handler(req, res);
  }
}));

const { query } = await import('../../backend/db.js');
const { default: handler } = await import('../../backend/orders/[id]/status.js');

describe('Order status endpoint with audit', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      method: 'PATCH',
      headers: {},
      query: { id: '77' },
      body: { status: 'enviado' },
      user: { id: 201, tipo: 'vendedor' }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('updates status and writes audit log', async () => {
    query.mockResolvedValueOnce([{ id: 99 }]);
    query.mockResolvedValueOnce([{ id: 77, status: 'confirmado', shipping_status: 'pending', payment_status: 'approved' }]);
    query.mockResolvedValueOnce([{ id: 77, status: 'enviado', shipping_status: 'pending', payment_status: 'approved' }]);
    query.mockResolvedValueOnce([{ id: 1 }]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(query).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        order: expect.objectContaining({ status: 'enviado' })
      })
    }));
  });
});
