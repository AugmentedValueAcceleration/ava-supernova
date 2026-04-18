import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  // i18n guardrail — webview UI components must not contain raw English text.
  // Every user-visible string must go through t() from ./i18n so it can be
  // translated into the 19 non-en locales. See scripts/i18n-check.mjs.
  {
    files: ['packages/extension/webview-ui/src/**/*.{ts,tsx}'],
    ignores: ['packages/extension/webview-ui/src/locales/**', 'packages/extension/webview-ui/src/i18n.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // JSX text nodes containing a word of 4+ chars starting with a capital
          // letter, or a full English phrase — matches the patterns we already
          // extracted in v0.44.0 (e.g. "Welcome to Ava", "Get Started").
          selector: "JSXText[value=/[A-Z][a-zA-Z]{3,}\\s+[a-zA-Z]|[A-Z][a-zA-Z]{6,}/]",
          message: "Raw English in JSX. Wrap in t('key') and add the key to packages/extension/webview-ui/src/locales/en.ts. Run pnpm i18n:translate after.",
        },
        {
          // String-literal aria-label / placeholder / title attributes on JSX
          // elements (aria-label="Close" etc). Force t() on these too.
          selector: "JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal[value=/^[A-Z][^{}]{2,}/]",
          message: "Raw English in JSX attribute. Wrap in t('key') and add the key to locales/en.ts.",
        },
      ],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs'],
  },
);
