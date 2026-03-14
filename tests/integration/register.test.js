import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/db.js', () => ({
  query: jest.fn(),
  getDb: jest.fn()
}));

const { query } = await import('../../backend/db.js');
const { default: handler } = await import('../../backend/auth/register.js');

const baseBody = {
  tipo: 'cliente',
  nome: 'Joao Silva',
  email: 'joao@example.com',
  senha: 'Senha@123',
  telefone: '11999999999',
  cpf_cnpj: '529.982.247-25'
};

describe('Auth Register API', () => {
  let req;
  let res;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test_secret';
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('should register a client successfully', async () => {
    req = { method: 'POST', body: { ...baseBody } };

    query.mockResolvedValueOnce([]); // email
    query.mockResolvedValueOnce([]); // phone
    query.mockResolvedValueOnce([]); // document
    query.mockResolvedValueOnce([
      {
        id: 1,
        tipo: 'cliente',
        nome: 'Joao Silva',
        email: 'joao@example.com',
        telefone: '11999999999',
        cpf_cnpj: '52998224725',
        tipo_documento: 'CPF'
      }
    ]); // insert user

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        message: 'Usuario criado com sucesso'
      })
    }));
  });

  test('should return error if email already exists', async () => {
    req = { method: 'POST', body: { ...baseBody } };

    query.mockResolvedValueOnce([{ id: 1 }]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'EMAIL_TAKEN' })
    }));
  });

  test('should return error for invalid CPF', async () => {
    req = { method: 'POST', body: { ...baseBody, cpf_cnpj: '111.111.111-11' } };

    await handler(req, res);

    expect(query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' })
    }));
  });

  test('should return error if phone already exists', async () => {
    req = { method: 'POST', body: { ...baseBody } };

    query.mockResolvedValueOnce([]); // email
    query.mockResolvedValueOnce([{ id: 2 }]); // phone

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'PHONE_TAKEN' })
    }));
  });

  test('should return error if CPF/CNPJ already exists', async () => {
    req = { method: 'POST', body: { ...baseBody } };

    query.mockResolvedValueOnce([]); // email
    query.mockResolvedValueOnce([]); // phone
    query.mockResolvedValueOnce([{ id: 3 }]); // document

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'DOCUMENT_TAKEN' })
    }));
  });

  test('should return standard password message for weak password', async () => {
    req = { method: 'POST', body: { ...baseBody, senha: 'abc12345' } };

    await handler(req, res);

    expect(query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('minimo 8 caracteres')
      })
    }));
  });

  test('should validate duplicated store name for vendor', async () => {
    req = {
      method: 'POST',
      body: {
        ...baseBody,
        tipo: 'vendedor',
        nomeLoja: 'Loja Mistica',
        categoria: 'Cristais',
        descricaoLoja: 'Loja de teste'
      }
    };

    query.mockResolvedValueOnce([]); // email
    query.mockResolvedValueOnce([]); // phone
    query.mockResolvedValueOnce([]); // document
    query.mockResolvedValueOnce([{ id: 4 }]); // store name

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'STORE_NAME_TAKEN' })
    }));
  });
});