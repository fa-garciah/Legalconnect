import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // ESLint flat config carries its own ignores; there is no .eslintignore.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '**/*.js', '**/*.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Tenant scope and audit entries are enforced by global mechanisms. A stray
      // `any` in those paths defeats the type-level part of that guarantee.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
