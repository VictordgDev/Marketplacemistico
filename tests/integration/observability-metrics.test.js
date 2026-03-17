import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireInternalRole: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 1, role: 'operator' };
    return handler(req, res);
  }
}));

const { incrementMetric, resetMetrics } = await import('../../backend/observability/metrics-store.js');
const { default: handler } = await import('../../backend/observability/metrics.js');

describe('Observability metrics API', () => {
  let req;
  let res;

  beforeEach(() => {
    resetMetrics();
    req = {
      method: 'GET',
      headers: {},
      query: {},
      body: {},
      user: { id: 1, role: 'operator' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('returns in-memory metrics snapshot', async () => {
    incrementMetric('payments.create.success.total');
    incrementMetric('webhooks.efi.processed.total');

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        metrics: expect.objectContaining({
          'payments.create.success.total': 1,
          'webhooks.efi.processed.total': 1
        })
      })
    }));
  });
});
