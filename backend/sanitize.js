import xss from 'xss';

/**
 * Sanitization utilities to prevent XSS and injection attacks
 */

// --- Helper Functions ---

/**
 * Extract only digits from a string
 * @param {string} s - Input string
 * @returns {string} - String with only digits
 */
export const onlyDigits = s => (s || '').replace(/\D+/g, '');

/**
 * Normalize whitespace in a string (trim and collapse multiple spaces)
 * @param {string} s - Input string
 * @returns {string} - Normalized string
 */
export function normalizeSpaces(s) {
  return (s || '').trim().replace(/\s+/g, ' ');
}

/**
 * Check if a code is a digit
 * @param {number} code - Character code
 * @returns {boolean}
 */
function isDigit(code) {
  return code >= 48 && code <= 57;
}

/**
 * Check if a code is a letter
 * @param {number} code - Character code
 * @returns {boolean}
 */
function isLetter(code) {
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}

/**
 * Detect sequential characters (e.g., "abcd", "1234") or repeated patterns
 * @param {string} s - Input string
 * @param {number} limit - Minimum length for bad sequence (default: 4)
 * @returns {boolean} - True if bad sequence detected
 */
export function hasBadSequence(s, limit = 4) {
  if (!s) return false;
  const str = s.toLowerCase();

  // Check for repeated characters (e.g., "aaaa")
  let run = 1;
  for (let i = 1; i < str.length; i += 1) {
    // eslint-disable-next-line security/detect-object-injection
    if (str[i] === str[i - 1]) {
      run += 1;
      if (run >= limit) return true;
    } else {
      run = 1;
    }
  }

  // Check for sequential characters (alphabetic or numeric)
  for (let i = 0; i <= str.length - limit; i += 1) {
    let ok = true;
    for (let j = 1; j < limit; j += 1) {
      const prev = str.charCodeAt(i + j - 1);
      const cur = str.charCodeAt(i + j);
      if (!((isDigit(prev) && isDigit(cur)) || (isLetter(prev) && isLetter(cur)))) {
        ok = false;
        break;
      }
      if (cur !== prev + 1) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }

  return false;
}

/**
 * Sanitize string input by removing potentially harmful characters
 * @param {string} input - The input string to sanitize
 * @returns {string} - Sanitized string
 */
export function sanitizeString(input) {
  if (typeof input !== 'string') return input;

  const sanitized = xss(input, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script']
  });

  return sanitized.trim().slice(0, 10000);
}

// --- Name Validation ---

/**
 * Sanitize name (normalize spaces)
 * @param {string} name - Name to sanitize
 * @returns {string} - Sanitized name
 */
export function sanitizeName(name) {
  return normalizeSpaces(name);
}

/**
 * Validate name (requires at least first and last name)
 * @param {string} name - Name to validate
 * @returns {object} - {ok: boolean, value?: string, reason?: string}
 */
export function validateName(name) {
  const n = sanitizeName(name);
  if (!n) return { ok: false, reason: 'Nome vazio' };
  if (!n.includes(' ')) return { ok: false, reason: 'Precisa ter pelo menos 2 nomes' };

  const parts = n.split(' ').filter(Boolean);
  if (parts.length < 2) return { ok: false, reason: 'Precisa ter pelo menos 2 nomes' };

  return { ok: true, value: n };
}

// --- Email Validation ---

/**
 * Sanitize email address
 * @param {string} email - The email to sanitize
 * @returns {string} - Sanitized email
 */
export function sanitizeEmail(email) {
  if (typeof email !== 'string') return email;

  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]/g, '')
    .slice(0, 255);
}

/**
 * Validate email address format
 * @param {string} email - Email to validate
 * @returns {object} - {ok: boolean, value: string, reason?: string}
 */
export function validateEmail(email) {
  const e = sanitizeEmail(email);
  const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    ok: rx.test(e),
    value: e,
    reason: rx.test(e) ? undefined : 'Formato de e-mail invalido'
  };
}

// --- Password Validation ---

export const PASSWORD_STANDARD_MESSAGE =
  'A senha deve ter no minimo 8 caracteres, incluindo letra, numero e caractere especial';

/**
 * Validate password strength and security
 * @param {string} pw - Password to validate
 * @returns {object} - {ok: boolean, reason?: string}
 */
export function validatePassword(pw) {
  if (!pw) return { ok: false, reason: PASSWORD_STANDARD_MESSAGE };
  if (pw.length < 8) return { ok: false, reason: PASSWORD_STANDARD_MESSAGE };
  if (!/[A-Za-z]/.test(pw)) return { ok: false, reason: PASSWORD_STANDARD_MESSAGE };
  if (!/[0-9]/.test(pw)) return { ok: false, reason: PASSWORD_STANDARD_MESSAGE };
  if (!/[^A-Za-z0-9]/.test(pw)) return { ok: false, reason: PASSWORD_STANDARD_MESSAGE };

  // Keep extra hardening to block weak sequential/repeated passwords.
  if (hasBadSequence(pw, 4)) {
    return { ok: false, reason: 'Nao pode conter sequencias ou repeticoes de 4+ caracteres' };
  }

  return { ok: true };
}

/**
 * Sanitize numeric input
 * @param {any} input - The input to sanitize as number
 * @returns {number|null} - Sanitized number or null
 */
export function sanitizeNumber(input) {
  const num = parseFloat(input);
  return Number.isNaN(num) ? null : num;
}

/**
 * Sanitize decimal numbers that must be positive.
 * @param {any} input
 * @param {object} opts
 * @param {boolean} opts.allowZero
 * @returns {number|null}
 */
export function sanitizeDecimalPositive(input, { allowZero = false } = {}) {
  const num = sanitizeNumber(input);
  if (num === null) return null;
  if (allowZero ? num < 0 : num <= 0) return null;
  return num;
}

/**
 * Sanitize integer input
 * @param {any} input - The input to sanitize as integer
 * @returns {number|null} - Sanitized integer or null
 */
export function sanitizeInteger(input) {
  const num = parseInt(input, 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Validate payout mode.
 * @param {string} payoutMode
 * @returns {object}
 */
export function sanitizePayoutMode(payoutMode) {
  const value = sanitizeString(payoutMode || '').toLowerCase();
  const allowed = ['efi_split', 'manual'];
  if (!value) return { ok: true, value: 'manual' };
  if (!allowed.includes(value)) {
    return { ok: false, reason: 'payout_mode invalido. Use efi_split ou manual' };
  }
  return { ok: true, value };
}

/**
 * Validate shipping dimensions payload.
 * @param {object} data
 * @param {boolean} requireAll
 * @returns {object}
 */
export function validateDimensions(data = {}, requireAll = false) {
  const weightKg = sanitizeDecimalPositive(data.weightKg ?? data.weight_kg);
  const heightCm = sanitizeDecimalPositive(data.heightCm ?? data.height_cm);
  const widthCm = sanitizeDecimalPositive(data.widthCm ?? data.width_cm);
  const lengthCm = sanitizeDecimalPositive(data.lengthCm ?? data.length_cm);
  const insuranceValue = sanitizeDecimalPositive(
    data.insuranceValue ?? data.insurance_value ?? 0,
    { allowZero: true }
  );

  if (requireAll && (!weightKg || !heightCm || !widthCm || !lengthCm)) {
    return { ok: false, reason: 'Peso e dimensoes sao obrigatorios para publicacao' };
  }

  if (
    (weightKg !== null && weightKg <= 0) ||
    (heightCm !== null && heightCm <= 0) ||
    (widthCm !== null && widthCm <= 0) ||
    (lengthCm !== null && lengthCm <= 0)
  ) {
    return { ok: false, reason: 'Peso e dimensoes devem ser positivos' };
  }

  if (insuranceValue === null) {
    return { ok: false, reason: 'insurance_value deve ser maior ou igual a zero' };
  }

  return {
    ok: true,
    value: {
      weightKg,
      heightCm,
      widthCm,
      lengthCm,
      insuranceValue
    }
  };
}

/**
 * Validate EFI payee code according to connection mode.
 * @param {string} efiPayeeCode
 * @param {boolean} isEfiConnected
 * @returns {object}
 */
export function validateEfiPayeeCode(efiPayeeCode, isEfiConnected) {
  const code = sanitizeString(efiPayeeCode || '');
  if (!isEfiConnected) {
    return { ok: true, value: '' };
  }
  if (!code) {
    return { ok: false, reason: 'efi_payee_code obrigatorio quando Efí estiver conectado' };
  }
  if (code.length < 6) {
    return { ok: false, reason: 'efi_payee_code invalido' };
  }
  return { ok: true, value: code };
}

/**
 * Sanitize URL
 * @param {string} url - The URL to sanitize
 * @returns {string} - Sanitized URL
 */
export function sanitizeUrl(url) {
  if (typeof url !== 'string') return '';

  const normalized = url.trim();

  if (normalized && !normalized.match(/^(https?:\/\/|\/)/)) {
    return '';
  }

  if (normalized.match(/^(javascript|data):/i)) {
    return '';
  }

  return normalized.slice(0, 2000);
}

// --- CPF/CNPJ Validation ---

/**
 * Sanitize CPF/CNPJ (keep only digits)
 * @param {string} value - CPF/CNPJ to sanitize
 * @returns {string} - Sanitized CPF/CNPJ (digits only)
 */
export function sanitizeCpfCnpj(value) {
  return onlyDigits(value || '');
}

function allDigitsEqual(value) {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(value) {
  const cpf = sanitizeCpfCnpj(value);
  if (cpf.length !== 11 || allDigitsEqual(cpf)) return false;

  let sum = 0;
  /* eslint-disable security/detect-object-injection */
  for (let i = 0; i < 9; i += 1) {
    sum += parseInt(cpf[i], 10) * (10 - i);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== parseInt(cpf[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += parseInt(cpf[i], 10) * (11 - i);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  const isValid = check === parseInt(cpf[10], 10);
  /* eslint-enable security/detect-object-injection */
  return isValid;
}

function isValidCnpj(value) {
  const cnpj = sanitizeCpfCnpj(value);
  if (cnpj.length !== 14 || allDigitsEqual(cnpj)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  /* eslint-disable security/detect-object-injection */
  for (let i = 0; i < 12; i += 1) {
    sum += parseInt(cnpj[i], 10) * weights1[i];
  }
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== parseInt(cnpj[12], 10)) return false;

  sum = 0;
  for (let i = 0; i < 13; i += 1) {
    sum += parseInt(cnpj[i], 10) * weights2[i];
  }
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  const isValid = digit2 === parseInt(cnpj[13], 10);
  /* eslint-enable security/detect-object-injection */
  return isValid;
}

/**
 * Validate CPF/CNPJ using check digits
 * @param {string} value - CPF/CNPJ to validate
 * @returns {object} - {type: string|null, ok: boolean, value?: string, reason?: string}
 */
export function validateCpfCnpj(value) {
  const digits = sanitizeCpfCnpj(value);
  if (digits.length === 11) {
    if (!isValidCpf(digits)) return { type: 'CPF', ok: false, reason: 'CPF invalido' };
    return { type: 'CPF', ok: true, value: digits };
  }
  if (digits.length === 14) {
    if (!isValidCnpj(digits)) return { type: 'CNPJ', ok: false, reason: 'CNPJ invalido' };
    return { type: 'CNPJ', ok: true, value: digits };
  }
  return { type: null, ok: false, reason: 'Deve ter 11 (CPF) ou 14 (CNPJ) digitos' };
}

/**
 * Detect and validate CPF/CNPJ based on digit count (legacy compatibility)
 * @param {string} value - CPF/CNPJ to detect and validate
 * @returns {object} - {type: string|null, ok: boolean, value?: string, reason?: string}
 */
export function detectCpfCnpj(value) {
  return validateCpfCnpj(value);
}

// --- Phone Validation ---

/**
 * Sanitize phone number (keep only digits)
 * @param {string} tel - Phone number to sanitize
 * @returns {string} - Sanitized phone (digits only)
 */
export function sanitizePhone(tel) {
  return onlyDigits(tel);
}

/**
 * Validate phone number (Brazilian format: 10 or 11 digits)
 * @param {string} tel - Phone number to validate
 * @returns {object} - {ok: boolean, value?: string, reason?: string}
 */
export function validatePhone(tel) {
  const digits = sanitizePhone(tel);
  if (digits.length === 10 || digits.length === 11) {
    return { ok: true, value: digits };
  }
  return { ok: false, reason: 'Telefone deve ter 10 ou 11 digitos (apos sanitizacao)' };
}

/**
 * Sanitize boolean input
 * @param {any} input - The input to convert to boolean
 * @returns {boolean} - Sanitized boolean
 */
export function sanitizeBoolean(input) {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    return input.toLowerCase() === 'true' || input === '1';
  }
  return Boolean(input);
}

/**
 * Sanitize an object's string properties
 * @param {object} obj - The object to sanitize
 * @param {string[]} stringFields - Array of field names to sanitize as strings
 * @param {string[]} emailFields - Array of field names to sanitize as emails
 * @param {string[]} urlFields - Array of field names to sanitize as URLs
 * @returns {object} - Object with sanitized fields
 */
export function sanitizeObject(obj, stringFields = [], emailFields = [], urlFields = []) {
  const sanitized = { ...obj };

  stringFields.forEach(field => {
    /* eslint-disable security/detect-object-injection */
    if (sanitized[field] !== undefined) {
      sanitized[field] = sanitizeString(sanitized[field]);
    }
    /* eslint-enable security/detect-object-injection */
  });

  emailFields.forEach(field => {
    /* eslint-disable security/detect-object-injection */
    if (sanitized[field] !== undefined) {
      sanitized[field] = sanitizeEmail(sanitized[field]);
    }
    /* eslint-enable security/detect-object-injection */
  });

  urlFields.forEach(field => {
    /* eslint-disable security/detect-object-injection */
    if (sanitized[field] !== undefined) {
      sanitized[field] = sanitizeUrl(sanitized[field]);
    }
    /* eslint-enable security/detect-object-injection */
  });

  return sanitized;
}
