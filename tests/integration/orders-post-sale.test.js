import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  withTransaction: jest.fn()
}));

jest.unstable_mockModule('../../backend/services/payments/refund-service.js', () => ({
  processRefundForPayment: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 101 };
    return handler(req, res);
  }
}));

const { withTransaction } = await import('../../backend/db.js');
const { processRefundForPayment } = await import('../../backend/services/payments/refund-service.js');
const { default: handler } = await import('../../backend/orders/[id]/post-sale.js');

describe('Order post-sale API', () => {
  let req;
  let res;
  let tx;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = { query: jest.fn() };
    withTransaction.mockImplementation(async (callback) => callback(tx));

    req = {
      method: 'POST',
      headers: {},
      query: { id: '50' },
      body: { action: 'cancel', reason: 'cliente desistiu' },
      user: { id: 101 }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('cancels order before shipping and triggers refund', async () => {
    processRefundForPayment.mockResolvedValue({ refund: { id: 9 } });

    tx.query.mockResolvedValueOnce({ rows: [{ id: 50, comprador_id: 101, status: 'confirmado', shipping_status: 'pending', payment_status: 'approved' }] });
    tx.query.mockResolvedValueOnce({ rows: [] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 11, order_id: 50, provider: 'efi', provider_charge_id: 'ch_1', amount: '100.00', status: 'approved' }] });
    tx.query.mockResolvedValueOnce({ rows: [] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 50, status: 'cancelado', shipping_status: 'cancelled', payment_status: 'refunded' }] });

    await handler(req, res);

    expect(processRefundForPayment).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        action: 'cancel',
        order: expect.objectContaining({ status: 'cancelado' }),
        refund: expect.objectContaining({ id: 9 })
      })
    }));
  });

  test('allows return request after delivery and triggers refund', async () => {
    req.body = { action: 'return_request', reason: 'produto com defeito' };
    processRefundForPayment.mockResolvedValue({ refund: { id: 10 } });

    tx.query.mockResolvedValueOnce({ rows: [{ id: 50, comprador_id: 101, status: 'entregue', shipping_status: 'delivered', payment_status: 'approved' }] });
    tx.query.mockResolvedValueOnce({ rows: [] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 11, order_id: 50, provider: 'efi', provider_charge_id: 'ch_1', amount: '100.00', status: 'approved' }] });
    tx.query.mockResolvedValueOnce({ rows: [] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 50, status: 'devolvido', shipping_status: 'returned', payment_status: 'refunded' }] });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        action: 'return_request',
        order: expect.objectContaining({ status: 'devolvido' })
      })
    }));
  });

  test('blocks cancellation after shipping', async () => {
    tx.query.mockResolvedValueOnce({ rows: [{ id: 50, comprador_id: 101, status: 'enviado', shipping_status: 'posted', payment_status: 'approved' }] });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'CANCEL_NOT_ALLOWED' })
    }));
  });
});
