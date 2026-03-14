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

const { query } = await import('../../backend/db.js');
const { default: handler } = await import('../../backend/users/upgrade-to-vendor.js');

describe('Upgrade To Vendor API', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'POST',
      headers: {},
      body: {
        nome_loja: 'Loja Mistica',
        categoria: 'Cristais',
        descricao_loja: 'Loja de teste',
        cpf_cnpj: '529.982.247-25'
      },
      user: { id: 10 }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('should reject invalid CPF/CNPJ', async () => {
    req.body.cpf_cnpj = '111.111.111-11';
    query.mockResolvedValueOnce([{ tipo: 'cliente' }]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' })
    }));
  });

  test('should reject duplicated CPF/CNPJ', async () => {
    query.mockResolvedValueOnce([{ tipo: 'cliente' }]); // current user type
    query.mockResolvedValueOnce([{ id: 99 }]); // existing document

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'DOCUMENT_TAKEN' })
    }));
  });

  test('should reject duplicated store name', async () => {
    query.mockResolvedValueOnce([{ tipo: 'cliente' }]); // current user type
    query.mockResolvedValueOnce([]); // existing document
    query.mockResolvedValueOnce([{ id: 1 }]); // existing store

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'STORE_NAME_TAKEN' })
    }));
  });
});