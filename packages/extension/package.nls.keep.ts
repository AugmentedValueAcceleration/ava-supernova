// KEEP_ENGLISH for the VSCode manifest (package.nls*.json).
// These manifest strings are correctly English in every locale:
//   - displayName / viewContainer.title → the brand name "Ava Supernova"
//   - view.chat.name → "Chat" (loanword used verbatim across our locales)
//   - lang.hi → display-language label, kept as the English endonym
// Read by scripts/i18n-check.mjs (regex-parsed only — never compiled).
type StringKey = string;
export const KEEP_ENGLISH_NLS = new Set<StringKey>([
  'displayName',
  'viewContainer.title',
  'view.chat.name',
  'lang.hi',
] as StringKey[]);
