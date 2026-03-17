import { jest } from '@jest/globals';
import { recordAuditLog } from '../../backend/services/audit/audit-service.js';

describe('audit service', () => {
  test('records audit log entry', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1, action: 'x' }] })
    };

    const entry = await recordAuditLog({
      db,
      actorUserId: 1,
      action: 'manual_payout.approve',
      resourceType: 'manual_payout',
      resourceId: 10,
      before: { status: 'pending' },
      after: { status: 'approved' },
      metadata: { reason: 'ok' }
    });

    expect(db.query).toHaveBeenCalled();
    expect(entry).toEqual(expect.objectContaining({ id: 1 }));
  });
});
