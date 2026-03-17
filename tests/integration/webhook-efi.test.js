import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn()
}));

const { query } = await import('../../backend/db.js');
const { default: handler } = await import('../../backend/webhooks/efi.js');

describe('EFI webhook idempotency', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'POST',
      headers: {},
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('processes a new event exactly once', async () => {
    req.body = {
      id: 'ch_123',
      event: 'payment_status_changed',
      status: 'paid'
    };

    query.mockResolvedValueOnce([{ id: 1 }]);
    query.mockResolvedValueOnce([{ id: 10, order_id: 99, status: 'pending' }]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ processed: true, providerChargeId: 'ch_123', status: 'approved' })
    }));
  });

  test('returns no-op for duplicate events', async () => {
    req.body = {
      id: 'ch_123',
      event: 'payment_status_changed',
      status: 'paid'
    };

    query.mockResolvedValueOnce([]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ message: 'Evento ja processado' })
    }));
  });

  test('marks event as ignored on invalid transition', async () => {
    req.body = {
      id: 'ch_123',
      event: 'payment_status_changed',
      status: 'pending'
    };

    query.mockResolvedValueOnce([{ id: 1 }]);
    query.mockResolvedValueOnce([{ id: 10, order_id: 99, status: 'approved' }]);
    query.mockResolvedValueOnce([]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ processed: false, reason: 'INVALID_PAYMENT_STATUS_TRANSITION' })
    }));
  });
});
