import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
export default defineConfig([
  globalIgnores(['dist', 'android', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{js,jsx}'], extends: [js.configs.recommended],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true, caughtErrors: 'none', argsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/**/*.{js,jsx}'], extends: [reactRefresh.configs.vite],
    plugins: { 'react-hooks': reactHooks },
    // React Compiler is not enabled in this app. Enforce the runtime Rules of
    // Hooks and dependency correctness, independently of compiler diagnostics.
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
  { files: ['api/**/*.js', 'server/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*config.js'], languageOptions: { globals: globals.node } },
  { files: ['public/sw*.js'], languageOptions: { globals: globals.serviceworker } },
]);
