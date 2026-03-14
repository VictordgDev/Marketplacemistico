import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn(),
  getDb: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 10 };
    return handler(req, res);
  }
}));

jest.unstable_mockModule('../../backend/services/shipping/melhor-envio-service.js', () => ({
  quoteWithMelhorEnvio: jest.fn()
}));

const { query } = await import('../../backend/db.js');
const { quoteWithMelhorEnvio } = await import('../../backend/services/shipping/melhor-envio-service.js');
const { default: handler } = await import('../../backend/shipping/quote.js');

describe('Shipping Quote API', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'POST',
      headers: {},
      body: {
        seller_id: 1,
        destination_postal_code: '01311-000',
        items: [{ product_id: 1 }, { product_id: 2 }],
        cart_id: 'cart_1'
      },
      user: { id: 10 }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('should quote and persist shipping options', async () => {
    query.mockResolvedValueOnce([{ seller_id: 1, from_postal_code: '01001000', from_state: 'SP' }]);
    query.mockResolvedValueOnce([
      { id: 1, seller_id: 1, preco: 50, weight_kg: 0.3, height_cm: 10, width_cm: 10, length_cm: 10 },
      { id: 2, seller_id: 1, preco: 60, weight_kg: 0.4, height_cm: 12, width_cm: 11, length_cm: 10 }
    ]);

    quoteWithMelhorEnvio.mockResolvedValueOnce({
      payload: { from: {}, to: {} },
      rawOptions: [],
      options: [
        { serviceId: 'pac', serviceName: 'PAC', carrierName: 'Correios', price: 20, customPrice: null, deliveryTime: 8, raw: {} },
        { serviceId: 'sedex', serviceName: 'SEDEX', carrierName: 'Correios', price: 30, customPrice: null, deliveryTime: 3, raw: {} }
      ]
    });

    query.mockResolvedValueOnce([{ id: 1001 }]);
    query.mockResolvedValueOnce([{ id: 1002 }]);

    await handler(req, res);

    expect(quoteWithMelhorEnvio).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        quotes: expect.any(Array)
      })
    }));
  });
});