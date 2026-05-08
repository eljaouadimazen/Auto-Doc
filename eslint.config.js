const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-redeclare': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'client/**',
      'public/**',
      'tests/**',
      'scripts/**',
    ],
  },
];
