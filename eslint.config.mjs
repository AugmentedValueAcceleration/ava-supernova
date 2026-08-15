import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

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
  // React hooks. Registered so `react-hooks/exhaustive-deps` actually EXISTS —
  // several components carry deliberate `eslint-disable-next-line
  // react-hooks/exhaustive-deps` comments for effects that intentionally omit a
  // dependency (one would loop, another would re-fire a fetch). With no plugin
  // providing the rule, eslint treated each of those comments as a reference to
  // an unknown rule and ERRORED — which is what stopped `next build` in the web
  // package outright, with no BUILD_ID produced.
  //
  // exhaustive-deps is a WARN deliberately: it is advisory and frequently wants
  // a dependency that would cause a loop. rules-of-hooks stays an ERROR because
  // breaking it is a real bug, not a style opinion.
  {
    files: ['packages/*/src/**/*.{ts,tsx}', 'packages/*/*-ui/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs'],
  },
);
