import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  withTransaction: jest.fn()
}));

jest.unstable_mockModule('../../backend/services/payments/efi-service.js', () => ({
  createEfiRefund: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 999 };
    return handler(req, res);
  }
}));

const { withTransaction } = await import('../../backend/db.js');
const { createEfiRefund } = await import('../../backend/services/payments/efi-service.js');
const { default: handler } = await import('../../backend/payments/refund.js');

describe('Payments refund API', () => {
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
      query: {},
      body: { payment_id: 10 },
      user: { id: 22 }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('creates full refund and updates payment/order statuses', async () => {
    createEfiRefund.mockResolvedValue({
      providerRefundId: 'rf_abc',
      refundReference: 'refund_1',
      status: 'processed',
      raw: { ok: true }
    });

    tx.query.mockResolvedValueOnce({
      rows: [{
        id: 10,
        order_id: 99,
        provider: 'efi',
        provider_charge_id: 'ch_123',
        amount: '100.00',
        status: 'approved',
        comprador_id: 22,
        vendedor_id: 5
      }]
    });
    tx.query.mockResolvedValueOnce({ rows: [{ refunded_total: '0.00' }] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 1, amount: '100.00', status: 'processed' }] });
    tx.query.mockResolvedValueOnce({ rows: [] });
    tx.query.mockResolvedValueOnce({ rows: [] });

    await handler(req, res);

    expect(createEfiRefund).toHaveBeenCalledWith(expect.objectContaining({
      providerChargeId: 'ch_123',
      amount: 100
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('blocks full refund when partial refund already exists', async () => {
    tx.query.mockResolvedValueOnce({
      rows: [{
        id: 10,
        order_id: 99,
        provider: 'efi',
        provider_charge_id: 'ch_123',
        amount: '100.00',
        status: 'approved',
        comprador_id: 22,
        vendedor_id: 5
      }]
    });
    tx.query.mockResolvedValueOnce({ rows: [{ refunded_total: '20.00' }] });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'PARTIAL_REFUND_EXISTS' })
    }));
  });
});
