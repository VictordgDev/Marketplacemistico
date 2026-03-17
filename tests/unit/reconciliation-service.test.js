import { jest } from '@jest/globals';
import { runDailyReconciliation } from '../../backend/services/finance/reconciliation-service.js';

describe('reconciliation service', () => {
  test('builds and stores reconciliation report with classified issues', async () => {
    const db = { query: jest.fn() };

    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, run_date: '2026-03-16', started_at: '2026-03-16T00:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ order_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ payment_id: 20, order_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ webhook_event_id: 30, external_id: 'ch_1', retry_count: 5, max_retries: 5 }] })
      .mockResolvedValueOnce({ rows: [{ manual_payout_id: 40, order_id: 10, created_at: '2026-03-01T00:00:00.000Z' }] });

    db.query.mockResolvedValue({ rows: [] });

    const report = await runDailyReconciliation({ db, runDate: '2026-03-16' });

    expect(report.run_id).toBe(1);
    expect(report.summary.total_issues).toBe(4);
    expect(report.summary.by_type.ORDER_PAYMENT_STATUS_WITHOUT_APPROVED_PAYMENT).toBe(1);
    expect(report.summary.by_type.APPROVED_PAYMENT_WITHOUT_PROCESSED_WEBHOOK).toBe(1);
    expect(report.summary.by_type.WEBHOOK_MAX_RETRIES_REACHED).toBe(1);
    expect(report.summary.by_type.MANUAL_PAYOUT_PENDING_TOO_LONG).toBe(1);
  });
});
