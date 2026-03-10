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
  for (let i = 1; i < str.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    if (str[i] === str[i-1]) {
      run++;
      if (run >= limit) return true;
    } else run = 1;
  }

  // Check for sequential characters (alphabetic or numeric)
  for (let i = 0; i <= str.length - limit; i++) {
    let ok = true;
    for (let j = 1; j < limit; j++) {
      const prev = str.charCodeAt(i + j - 1);
      const cur = str.charCodeAt(i + j);
      // Allow sequences within same type: letters with letters, digits with digits
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
  
  // Use xss library for robust sanitization
  const sanitized = xss(input, {
    whiteList: {}, // Empty whitelist means all tags are stripped/escaped
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
  
  // Check for at least 2 parts
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
    reason: rx.test(e) ? undefined : 'Formato de e-mail inválido' 
  };
}

// --- Password Validation ---

/**
 * Validate password strength and security
 * @param {string} pw - Password to validate
 * @returns {object} - {ok: boolean, reason?: string}
 */
export function validatePassword(pw) {
  if (!pw) return { ok: false, reason: 'Senha vazia' };
  if (pw.length < 8) return { ok: false, reason: 'Precisa ter ao menos 8 caracteres' };
  
  // At least 1 special character (non-alphanumeric)
  if (!/[^A-Za-z0-9]/.test(pw)) {
    return { ok: false, reason: 'Precisa ter ao menos 1 caractere especial' };
  }
  
  // No sequences or repetitions of 4+ characters
  if (hasBadSequence(pw, 4)) {
    return { ok: false, reason: 'Não pode conter sequências ou repetições de 4+ caracteres' };
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
  return isNaN(num) ? null : num;
}

/**
 * Sanitize integer input
 * @param {any} input - The input to sanitize as integer
 * @returns {number|null} - Sanitized integer or null
 */
export function sanitizeInteger(input) {
  const num = parseInt(input, 10);
  return isNaN(num) ? null : num;
}

/**
 * Sanitize URL
 * @param {string} url - The URL to sanitize
 * @returns {string} - Sanitized URL
 */
export function sanitizeUrl(url) {
  if (typeof url !== 'string') return '';
  
  url = url.trim();
  
  // Only allow http, https, and relative URLs
  if (url && !url.match(/^(https?:\/\/|\/)/)) {
    return '';
  }
  
  // Remove javascript: and data: protocols
  if (url.match(/^(javascript|data):/i)) {
    return '';
  }
  
  return url.slice(0, 2000);
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

/**
 * Detect and validate CPF/CNPJ based on digit count
 * @param {string} value - CPF/CNPJ to detect and validate
 * @returns {object} - {type: string|null, ok: boolean, value?: string, reason?: string}
 */
export function detectCpfCnpj(value) {
  const digits = sanitizeCpfCnpj(value);
  if (digits.length === 11) {
    return { type: 'CPF', ok: true, value: digits };
  }
  if (digits.length === 14) {
    return { type: 'CNPJ', ok: true, value: digits };
  }
  return { type: null, ok: false, reason: 'Deve ter 11 (CPF) ou 14 (CNPJ) dígitos' };
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
  // In Brazil: 10 (without 9) or 11 digits (with 9)
  if (digits.length === 10 || digits.length === 11) {
    return { ok: true, value: digits };
  }
  return { ok: false, reason: 'Telefone deve ter 10 ou 11 dígitos (após sanitização)' };
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
