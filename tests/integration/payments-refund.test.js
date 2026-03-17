import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  withTransaction: jest.fn()
}));

jest.unstable_mockModule('../../backend/services/payments/refund-service.js', () => ({
  processRefundForPayment: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 999 };
    return handler(req, res);
  }
}));

const { withTransaction } = await import('../../backend/db.js');
const { processRefundForPayment } = await import('../../backend/services/payments/refund-service.js');
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

  test('creates refund through shared refund service', async () => {
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

    processRefundForPayment.mockResolvedValue({
      refund: { id: 1 },
      paymentStatus: 'refunded',
      refundableBefore: 100,
      refundableAfter: 0,
      provider: { providerRefundId: 'rf_1' }
    });

    await handler(req, res);

    expect(processRefundForPayment).toHaveBeenCalledWith(expect.objectContaining({
      requestedAmount: null,
      requestedByUserId: 22
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('passes partial amount to refund service', async () => {
    req.body = { payment_id: 10, amount: 30 };

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

    processRefundForPayment.mockResolvedValue({
      refund: { id: 2 },
      paymentStatus: 'partially_refunded',
      refundableBefore: 100,
      refundableAfter: 70,
      provider: { providerRefundId: 'rf_2' }
    });

    await handler(req, res);

    expect(processRefundForPayment).toHaveBeenCalledWith(expect.objectContaining({
      requestedAmount: 30
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('returns business error from refund service', async () => {
    req.body = { payment_id: 10, amount: 90 };

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

    const error = new Error('Valor solicitado excede o saldo reembolsavel');
    error.code = 'REFUND_AMOUNT_EXCEEDS_BALANCE';
    processRefundForPayment.mockRejectedValue(error);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'REFUND_AMOUNT_EXCEEDS_BALANCE' })
    }));
  });

  test('returns 404 when payment is not found', async () => {
    tx.query.mockResolvedValueOnce({ rows: [] });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
