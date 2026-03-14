import {
  sanitizeCpfCnpj,
  detectCpfCnpj,
  validateCpfCnpj,
  validatePassword,
  validateEmail,
  sanitizeString
} from '../../backend/sanitize.js';

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
      expect(sanitizeCpfCnpj('529.982.247-25')).toBe('52998224725');
    });

    test('should remove non-digit characters from CNPJ', () => {
      expect(sanitizeCpfCnpj('12.345.678/0001-95')).toBe('12345678000195');
    });

    test('should return empty string if input is null or undefined', () => {
      expect(sanitizeCpfCnpj(null)).toBe('');
      expect(sanitizeCpfCnpj(undefined)).toBe('');
    });
  });

  describe('CPF/CNPJ Validation', () => {
    test('should validate CPF correctly', () => {
      const result = validateCpfCnpj('529.982.247-25');
      expect(result.ok).toBe(true);
      expect(result.type).toBe('CPF');
      expect(result.value).toBe('52998224725');
    });

    test('should validate CNPJ correctly', () => {
      const result = validateCpfCnpj('12.345.678/0001-95');
      expect(result.ok).toBe(true);
      expect(result.type).toBe('CNPJ');
      expect(result.value).toBe('12345678000195');
    });

    test('detectCpfCnpj should use strict validation', () => {
      const result = detectCpfCnpj('111.111.111-11');
      expect(result.ok).toBe(false);
      expect(result.type).toBe('CPF');
    });
  });

  describe('Password Validation', () => {
    test('should accept valid password', () => {
      const result = validatePassword('Senha@123');
      expect(result.ok).toBe(true);
    });

    test('should reject short password', () => {
      const result = validatePassword('S@1abc');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('minimo 8');
    });

    test('should reject password without special character', () => {
      const result = validatePassword('Senha12345');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('caractere especial');
    });

    test('should reject password without letter', () => {
      const result = validatePassword('12345678@');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('incluindo letra');
    });

    test('should reject password with sequences', () => {
      const result = validatePassword('abcde@123');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('sequencias');
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