import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  withTransaction: jest.fn()
}));

jest.unstable_mockModule('../../backend/services/finance/ledger-service.js', () => ({
  recordManualPayoutLedgerEntry: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireInternalRole: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 77, role: 'operator' };
    if (!req.user.role) req.user.role = 'operator';
    return handler(req, res);
  }
}));

const { withTransaction } = await import('../../backend/db.js');
const { recordManualPayoutLedgerEntry } = await import('../../backend/services/finance/ledger-service.js');
const { default: handler } = await import('../../backend/manual-payouts/[id]/action.js');

describe('Manual payout action API', () => {
  let req;
  let res;
  let tx;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = { query: jest.fn() };
    withTransaction.mockImplementation(async (callback) => callback(tx));
    recordManualPayoutLedgerEntry.mockResolvedValue(undefined);

    req = {
      method: 'POST',
      headers: {},
      query: { id: '12' },
      body: { action: 'approve', reason: 'ok' },
      user: { id: 77 }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('approves manual payout from pending status', async () => {
    tx.query.mockResolvedValueOnce({ rows: [{ id: 12, order_id: 44, amount: '90.00', status: 'pending' }] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 12, status: 'approved' }] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 1, action: 'approve' }] });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        payout: expect.objectContaining({ status: 'approved' })
      })
    }));
  });

  test('marks payout as paid and records ledger outflow', async () => {
    req.body = { action: 'pay', external_reference: 'cmp_123' };

    tx.query.mockResolvedValueOnce({ rows: [{ id: 12, order_id: 44, amount: '90.00', status: 'approved' }] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 12, order_id: 44, amount: '90.00', status: 'paid' }] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 2, action: 'pay' }] });
    tx.query.mockResolvedValueOnce({ rows: [{ id: 500 }] });

    await handler(req, res);

    expect(recordManualPayoutLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 44,
      paymentId: 500,
      manualPayoutId: 12,
      amount: 90
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('blocks invalid transition', async () => {
    req.body = { action: 'pay', external_reference: 'cmp_123' };

    tx.query.mockResolvedValueOnce({ rows: [{ id: 12, order_id: 44, amount: '90.00', status: 'pending' }] });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'INVALID_TRANSITION' })
    }));
  });
});
