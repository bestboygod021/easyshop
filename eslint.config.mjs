import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';

const sourceFiles = ['**/*.{js,jsx,mjs,cjs}'];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/artifacts/**',
      'desktop/release/**',
      'mobile/android/**',
      'mobile/ios/**',
      'server/data/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Legacy tests, tooling, and JSX need scoped cleanup; server/src enables this rule below.
      'no-unused-vars': 'off',
    },
  },
  {
    files: [
      'server/**/*.{js,mjs,cjs}',
      'tools/**/*.{js,mjs,cjs}',
      'desktop/**/*.{js,mjs,cjs}',
      'mobile/**/*.{js,mjs,cjs}',
      'playwright.config.mjs',
      'eslint.config.mjs',
      'web/vite.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['server/src/**/*.{js,mjs,cjs}'],
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['web/src/**/*.{js,jsx,mjs}', 'web/public/**/*.{js,jsx,mjs}', 'web/e2e/**/*.{js,jsx,mjs}'],
    languageOptions: { globals: globals.browser },
    // Core ESLint does not account for JSX references without a React plugin.
    // Keep no-undef and the other recommended checks active without false unused import reports.
    rules: { 'no-unused-vars': 'off' },
  },
  {
    files: ['web/src/**/*.{js,jsx,mjs}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
