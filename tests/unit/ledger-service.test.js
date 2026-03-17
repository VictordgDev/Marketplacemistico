import { jest } from '@jest/globals';
import {
  getOrderLedgerSummary,
  recordPaymentLedgerEntries,
  recordRefundLedgerEntry
} from '../../backend/services/finance/ledger-service.js';

describe('ledger service', () => {
  test('calculates credits, debits and balance', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { side: 'credit', amount: '120.00' },
          { side: 'credit', amount: '12.00' },
          { side: 'debit', amount: '108.00' },
          { side: 'debit', amount: '10.00' }
        ]
      })
    };

    const summary = await getOrderLedgerSummary({ db, orderId: 50 });

    expect(summary.credits).toBe(132);
    expect(summary.debits).toBe(118);
    expect(summary.balance).toBe(14);
  });

  test('records payment and refund entries with source keys', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] })
    };

    await recordPaymentLedgerEntries({
      db,
      orderId: 1,
      paymentId: 2,
      grossAmount: 100,
      platformFeeAmount: 10,
      sellerNetAmount: 90,
      splitMode: 'manual'
    });

    await recordRefundLedgerEntry({
      db,
      orderId: 1,
      paymentId: 2,
      refundId: 3,
      amount: 20
    });

    expect(db.query).toHaveBeenCalled();
    expect(db.query.mock.calls.some(([, params]) => params?.includes('payment:2:inflow'))).toBe(true);
    expect(db.query.mock.calls.some(([, params]) => params?.includes('refund:3:outflow'))).toBe(true);
  });
});
