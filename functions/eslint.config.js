const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
module.exports = tseslint.config(
  { ignores: ['lib', 'node_modules', 'jest.config.js', 'eslint.config.js'] },
  ...tseslint.configs.recommended,
  prettier,
);
