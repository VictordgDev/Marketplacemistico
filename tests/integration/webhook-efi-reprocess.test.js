import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn()
}));

const { query } = await import('../../backend/db.js');
const { default: handler } = await import('../../backend/webhooks/efi/reprocess.js');

describe('EFI webhook manual reprocess API', () => {
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

  test('reprocesses an event by id', async () => {
    req.body = { event_id: 12 };

    query.mockResolvedValueOnce([
      {
        id: 12,
        status: 'processing',
        retry_count: 1,
        max_retries: 5,
        payload_json: { id: 'ch_abc', event: 'payment_status_changed', status: 'paid' }
      }
    ]);
    query.mockResolvedValueOnce([{ id: 90, order_id: 45, status: 'pending' }]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ processed: true, event_id: 12 })
    }));
  });

  test('returns 404 when webhook event id does not exist', async () => {
    req.body = { event_id: 9999 };

    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
