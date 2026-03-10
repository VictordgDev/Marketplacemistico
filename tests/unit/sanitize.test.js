import {
  sanitizeCpfCnpj,
  detectCpfCnpj,
  validatePassword,
  validateEmail,
  sanitizeString
} from '../../api/sanitize.js';

describe('Sanitization Utilities', () => {

  describe('String Sanitization (XSS)', () => {
    test('should remove script tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      expect(sanitizeString(input)).toBe('Hello');
    });

    test('should escape other tags when whitelist is empty', () => {
      const input = '<p>Hello</p> <img src="x" onerror="alert(1)">';
      const result = sanitizeString(input);
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('onerror');
    });

    test('should remove javascript: protocol', () => {
      const input = '<a href="javascript:alert(1)">Click me</a>';
      expect(sanitizeString(input)).not.toContain('javascript:');
    });
  });

  describe('CPF/CNPJ Sanitization', () => {
    test('should remove non-digit characters from CPF', () => {
      expect(sanitizeCpfCnpj('123.456.789-00')).toBe('12345678900');
    });

    test('should remove non-digit characters from CNPJ', () => {
      expect(sanitizeCpfCnpj('12.345.678/0001-99')).toBe('12345678000199');
    });

    test('should return empty string if input is null or undefined', () => {
      expect(sanitizeCpfCnpj(null)).toBe('');
      expect(sanitizeCpfCnpj(undefined)).toBe('');
    });
  });

  describe('CPF/CNPJ Detection', () => {
    test('should detect CPF correctly', () => {
      const result = detectCpfCnpj('123.456.789-00');
      expect(result.ok).toBe(true);
      expect(result.type).toBe('CPF');
      expect(result.value).toBe('12345678900');
    });

    test('should detect CNPJ correctly', () => {
      const result = detectCpfCnpj('12.345.678/0001-99');
      expect(result.ok).toBe(true);
      expect(result.type).toBe('CNPJ');
      expect(result.value).toBe('12345678000199');
    });

    test('should fail for invalid length', () => {
      const result = detectCpfCnpj('123.456.789');
      expect(result.ok).toBe(false);
      expect(result.type).toBe(null);
    });
  });

  describe('Password Validation', () => {
    test('should accept valid password', () => {
      const result = validatePassword('Senha@123');
      expect(result.ok).toBe(true);
    });

    test('should reject short password', () => {
      const result = validatePassword('Senh@1');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('8 caracteres');
    });

    test('should reject password without special character', () => {
      const result = validatePassword('Senha12345');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('especial');
    });

    test('should reject password with sequences', () => {
      const result = validatePassword('abcde@123');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('sequências');
    });

    test('should reject password with repetitions', () => {
      const result = validatePassword('aaaaa@123');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('repetições');
    });
  });

  describe('Email Validation', () => {
    test('should validate correct email', () => {
      const result = validateEmail('test@example.com');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    test('should reject invalid email format', () => {
      const result = validateEmail('invalid-email');
      expect(result.ok).toBe(false);
    });

    test('should sanitize email (lowercase and trim)', () => {
      const result = validateEmail('  TEST@Example.com  ');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('test@example.com');
    });
  });
});
