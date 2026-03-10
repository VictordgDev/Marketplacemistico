import { jest } from '@jest/globals';

// Use absolute path relative to the test file if possible, or correct relative path
jest.unstable_mockModule('../../api/db.js', () => ({
  query: jest.fn(),
  getDb: jest.fn()
}));

const { query } = await import('../../api/db.js');
const { default: handler } = await import('../../api/auth/register.js');

describe('Auth Register API', () => {
  let req, res;

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
    req = {
      method: 'POST',
      body: {
        tipo: 'cliente',
        nome: 'João Silva',
        email: 'joao@example.com',
        senha: 'Senha@123',
        telefone: '11999999999',
        cpf_cnpj: '123.456.789-00'
      }
    };

    query.mockResolvedValueOnce([]); // Existing user check
    query.mockResolvedValueOnce([{ id: 1, tipo: 'cliente', nome: 'João Silva', email: 'joao@example.com', telefone: '11999999999' }]); // Insert user

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        message: 'Usuário criado com sucesso'
      })
    }));
  });

  test('should return error if email already exists', async () => {
    req = {
      method: 'POST',
      body: {
        tipo: 'cliente',
        nome: 'João Silva',
        email: 'joao@example.com',
        senha: 'Senha@123',
        telefone: '11999999999',
        cpf_cnpj: '123.456.789-00'
      }
    };

    query.mockResolvedValueOnce([{ id: 1 }]); // Existing user check

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'EMAIL_TAKEN'
      })
    }));
  });
});
