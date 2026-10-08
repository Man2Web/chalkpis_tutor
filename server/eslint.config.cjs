const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
module.exports = tseslint.config(
  { ignores: ['dist', 'node_modules', 'eslint.config.cjs'] },
  ...tseslint.configs.recommended,
  prettier,
);
