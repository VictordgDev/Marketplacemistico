import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/services/finance/reconciliation-service.js', () => ({
  runDailyReconciliation: jest.fn()
}));

const { runDailyReconciliation } = await import('../../backend/services/finance/reconciliation-service.js');
const { default: handler } = await import('../../backend/finance/reconciliation/daily.js');

describe('Finance reconciliation daily API', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { run_date: '2026-03-16' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('returns generated reconciliation report', async () => {
    runDailyReconciliation.mockResolvedValueOnce({
      run_id: 5,
      run_date: '2026-03-16',
      summary: { total_issues: 2 },
      issues: [{ issue_type: 'X' }, { issue_type: 'Y' }]
    });

    await handler(req, res);

    expect(runDailyReconciliation).toHaveBeenCalledWith({ runDate: '2026-03-16' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        report: expect.objectContaining({ run_id: 5 })
      })
    }));
  });
});
