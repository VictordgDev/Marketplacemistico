import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn(),
  getDb: jest.fn()
}));

jest.unstable_mockModule('../../backend/auth-middleware.js', () => ({
  requireAuth: (handler) => async (req, res) => {
    if (!req.user) req.user = { id: 10 };
    return handler(req, res);
  }
}));

jest.unstable_mockModule('../../backend/services/payments/efi-service.js', () => ({
  createEfiCharge: jest.fn()
}));

const { query } = await import('../../backend/db.js');
const { createEfiCharge } = await import('../../backend/services/payments/efi-service.js');
const { default: handler } = await import('../../backend/payments/create.js');

describe('Payments Create API', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'POST',
      headers: {},
      body: { order_id: 100, payment_method: 'pix' },
      user: { id: 10 }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('should create payment and split for EFI seller', async () => {
    query.mockResolvedValueOnce([
      {
        id: 100,
        comprador_id: 10,
        vendedor_id: 1,
        total: 120,
        grand_total: 120,
        seller_id: 1,
        nome_loja: 'Loja X',
        is_efi_connected: true,
        efi_payee_code: 'payee_123',
        commission_rate: 0.1,
        manual_payout_fee_rate: 0.05
      }
    ]);
    query.mockResolvedValueOnce([{ id: 10, nome: 'Joao', email: 'joao@x.com', cpf_cnpj: '52998224725' }]);
    createEfiCharge.mockResolvedValueOnce({
      providerChargeId: 'charge_123',
      status: 'pending',
      paymentMethod: 'pix',
      pixQrCode: 'qr',
      pixCopyPaste: 'copy',
      splitMode: 'efi_split',
      splitRecipientCode: 'payee_123',
      raw: { ok: true }
    });
    query.mockResolvedValueOnce([{ id: 500, status: 'pending' }]);
    query.mockResolvedValueOnce({});

    await handler(req, res);

    expect(createEfiCharge).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        splitMode: 'efi_split'
      })
    }));
  });
});