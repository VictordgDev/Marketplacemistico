import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn()
}));

const { query } = await import('../../backend/db.js');
const { default: handler } = await import('../../backend/webhooks/efi/retry.js');

describe('EFI webhook retry queue API', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'POST',
      headers: {},
      query: {},
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('processes claimed failed events', async () => {
    query.mockResolvedValueOnce([
      { id: 1, payload_json: { id: 'ch_1', event: 'payment_status_changed', status: 'paid' } }
    ]);
    query.mockResolvedValueOnce([{ id: 55, order_id: 100, status: 'pending' }]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        queue: expect.objectContaining({ claimed: 1, processed: 1 })
      })
    }));
  });

  test('keeps event in retry queue on retryable error', async () => {
    query.mockResolvedValueOnce([
      { id: 2, payload_json: { id: 'ch_2', event: 'payment_status_changed', status: 'paid' } }
    ]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([
      { id: 2, status: 'failed', retry_count: 2, max_retries: 5, next_retry_at: '2026-03-16T12:00:00.000Z' }
    ]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        queue: expect.objectContaining({ claimed: 1, retryQueued: 1 })
      })
    }));
  });
});
