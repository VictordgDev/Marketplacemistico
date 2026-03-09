import { jest } from '@jest/globals';

jest.unstable_mockModule('../../api/db.js', () => ({
  query: jest.fn(),
  getDb: jest.fn()
}));

// Mocking requireAuth to bypass JWT validation in integration tests
jest.unstable_mockModule('../../api/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    // In tests, we manually set req.user
    if (!req.user) {
      req.user = { id: 999 };
    }
    return handler(req, res);
  }
}));

const { query } = await import('../../api/db.js');
const { default: handler } = await import('../../api/orders/index.js');

describe('Orders API', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
    req = {
      headers: {},
      query: {},
      user: { id: 10, email: 'buyer@example.com' }
    };
  });

  test('should create an order successfully', async () => {
    req.method = 'POST';
    req.body = {
      items: [
        { product_id: 1, quantidade: 2 }
      ],
      address_id: 5
    };

    query.mockResolvedValueOnce([
      { id: 1, preco: 50.00, estoque: 10, seller_id: 1, publicado: true, seller_user_id: 20 }
    ]);
    query.mockResolvedValueOnce([{ id: 100 }]);
    query.mockResolvedValueOnce({});
    query.mockResolvedValueOnce({});
    query.mockResolvedValueOnce([{ id: 100, total: 100.00, status: 'pendente', items: [] }]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('should return error if stock is insufficient', async () => {
    req.method = 'POST';
    req.body = {
      items: [{ product_id: 1, quantidade: 20 }],
      address_id: 5
    };

    query.mockResolvedValueOnce([
      { id: 1, preco: 50.00, estoque: 10, seller_id: 1, publicado: true, seller_user_id: 20 }
    ]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' })
    }));
  });

  test('should prevent seller from buying their own products', async () => {
    req.method = 'POST';
    req.user.id = 20;
    req.body = {
      items: [{ product_id: 1, quantidade: 1 }],
      address_id: 5
    };

    query.mockResolvedValueOnce([
      { id: 1, preco: 50.00, estoque: 10, seller_id: 1, publicado: true, seller_user_id: 20 }
    ]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
