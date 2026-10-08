const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  { ignores: ['node_modules', '.expo', 'android', 'ios', 'coverage', '*.config.js'] },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
);
