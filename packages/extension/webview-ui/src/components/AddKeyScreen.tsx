/**
 * AddKeyScreen — what the chat shows when no model can run yet.
 *
 * Ava has no accounts (1 Nov 2026): everyone brings their own key, so the
 * first thing a new install needs is one. This replaces the sign-in screen.
 * The key itself is added in the dashboard's onboarding, where it is tested
 * before it is saved — one place for it, not two forms that drift apart.
 */

import { t } from '../i18n';

interface AddKeyScreenProps {
  /** Open the dashboard on the key step. */
  onAddKey: () => void;
}

export function AddKeyScreen({ onAddKey }: AddKeyScreenProps) {
  return (
    <div className="w-full max-w-md mx-auto px-6 py-6">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold mb-2">{t('addkey.title')}</h2>
        <p className="text-sm opacity-60">{t('addkey.subtitle')}</p>
      </div>

      <button
        onClick={onAddKey}
        className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm text-white transition-all hover:brightness-110"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {t('addkey.cta')}
      </button>

      <p className="text-xs opacity-50 text-center">{t('addkey.qwen_tip')}</p>
      <p className="text-xs opacity-40 text-center mt-4">{t('addkey.local_note')}</p>
    </div>
  );
}
