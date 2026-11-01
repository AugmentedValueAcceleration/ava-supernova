import { t, useLocale } from '../i18n';

/**
 * Thin status strip rendered above every non-Chat page: the hub-set
 * announcement ticker and what this install takes on disk.
 *
 * Chat has its own full Header (model picker, conversation title,
 * Tasks, New Chat); this is the compact equivalent for pages that
 * don't need those affordances. (Plan tier and credit balance lived
 * here until accounts went, 1 Nov 2026 — your provider holds the bill.)
 */

import { AnnouncementTicker } from './AnnouncementTicker';
import { StorageBar } from './StorageBar';
import type { StorageScan } from '../types/messages';

interface Props {
  /** Hub-set announcement messages for the left-hand ticker. */
  announcement?: string[];
  /** Local footprint for the right-hand storage bar. The dashboard's only
   *  instance — pages no longer mount their own. */
  storageScan?: StorageScan | null;
  projectsUsage?: import('@ava/core/projects/storage').ProjectsUsage | null;
}

export function DashboardTopBar({ announcement, storageScan, projectsUsage }: Props) {
  useLocale();
  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--accent)_10%,transparent)] bg-gradient-to-r from-[#0f0f17] to-[#1a1625] px-6 py-2"
      style={{ minHeight: 40 }}
    >
      {/* Left — announcement ticker (hub-set), fills the gap and truncates. */}
      <div className="min-w-0 flex-1">
        {announcement && announcement.length > 0 && <AnnouncementTicker messages={announcement} />}
      </div>
      {/* Right — what this install costs on this disk. One instance for the
          whole dashboard: it used to be mounted per page, which is how its
          placement drifted from the IDE's without any single copy looking
          wrong. Same strip, same density as the IDE's status bar. */}
      <div className="flex flex-shrink-0 items-center gap-3">
        <StorageBar scan={storageScan ?? null} projects={projectsUsage} label={t('dash.cc.storage')} compact />
      </div>
    </div>
  );
}
