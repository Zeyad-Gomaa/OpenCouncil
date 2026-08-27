const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-config-prettier')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = tseslint.config(
  {
    // Build output, dependencies, and the committed artifacts we ship.
    ignores: [
      'node_modules/**',
      'apps/server/dist/**',
      'apps/web/.next/**',
      'apps/web/out/**',
      'packages/shared/dist/**',
      'data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // Underscore marks a binding that is intentionally unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': 'off',
    },
  },
  {
    // The chamber UI: rules-of-hooks matter here and nowhere else.
    files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // CommonJS tooling and launcher scripts.
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
)
