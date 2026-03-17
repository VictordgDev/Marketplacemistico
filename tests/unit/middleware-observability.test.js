import { jest } from '@jest/globals';
import { withCors } from '../../backend/middleware.js';

describe('middleware observability', () => {
  test('injects correlation id and response header', async () => {
    const req = {
      method: 'GET',
      url: '/api/test',
      headers: {}
    };

    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      status: jest.fn(function setStatus(code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };

    const wrapped = withCors(async (_req, response) => response.status(200).json({ ok: true }));
    await wrapped(req, res);

    expect(req.correlationId).toBeTruthy();
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', expect.any(String));
  });

  test('keeps provided correlation id', async () => {
    const req = {
      method: 'GET',
      url: '/api/test',
      headers: { 'x-correlation-id': 'corr_123' }
    };

    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      status: jest.fn(function setStatus(code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };

    const wrapped = withCors(async (_req, response) => response.status(200).json({ ok: true }));
    await wrapped(req, res);

    expect(req.correlationId).toBe('corr_123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'corr_123');
  });
});
