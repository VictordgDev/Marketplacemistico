import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn()
}));

jest.unstable_mockModule('../../backend/services/finance/ledger-service.js', () => ({
  getOrderLedgerSummary: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 10 };
    return handler(req, res);
  }
}));

const { query } = await import('../../backend/db.js');
const { getOrderLedgerSummary } = await import('../../backend/services/finance/ledger-service.js');
const { default: handler } = await import('../../backend/finance/ledger/[orderId].js');

describe('Finance ledger API', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'GET',
      headers: {},
      query: { orderId: '77' },
      user: { id: 10 }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('returns ledger summary for authorized order', async () => {
    query.mockResolvedValueOnce([{ id: 77 }]);
    getOrderLedgerSummary.mockResolvedValueOnce({
      orderId: 77,
      credits: 100,
      debits: 80,
      balance: 20,
      entries: []
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ ledger: expect.objectContaining({ balance: 20 }) })
    }));
  });
});
