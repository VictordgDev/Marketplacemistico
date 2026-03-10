import security from 'eslint-plugin-security';
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser
      }
    },
    rules: {
      'no-unused-vars': ['error', { 'varsIgnorePattern': '^_' }],
      'no-console': 'off',
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-unsafe-regex': 'warn'
    }
  }
];
