import { lazy, Suspense } from 'react';
import type { AccountInfo, ExtToDashboardMessage, ChatModel, ChatPlatformStatus } from '../types/messages';

/**
 * Design Studio is loaded ON DEMAND, and it is the one page where that matters
 * most.
 *
 * It is not the page code that makes it heavy — it is what the page drags in.
 * `lib/asset-forge/` is reachable from nowhere else, and it pulls `lucide`
 * (imported as the whole `icons` barrel, 722KB, untreeshakeable) and
 * `opentype.js` (475KB) for logo and shape generation. Measured on 7 Oct 2026,
 * this single lazy() took the dashboard's main bundle from 5,422KB to 4,391KB
 * — 1,031KB, 19%, off what every user parses before anything paints, whether
 * or not they ever open Creative Studio.
 *
 * This is also the first page split after the webview was proven able to load
 * a chunk at all. See the <script type="module"> note in DashboardPanel.ts for
 * why that took a CSP change and a spike rather than just a lazy() call.
 */
const DesignStudio = lazy(() =>
  import('./DesignStudio').then((m) => ({ default: m.DesignStudio })),
);

export type DesignModelState = { models: ChatModel[]; activeModel: string | null; needsSetup: boolean; platformStatus: ChatPlatformStatus | null };

/* ══════════════════════════════════════════════════════════════════════
   Creative Studio
   ══════════════════════════════════════════════════════════════════════
   Creative Studio IS the Design Studio now. The old Compose surface
   (image/music/voice/video composer, tabs, and the Compose|Design Studio
   toggle) has been retired — opening Creative Studio drops the user
   straight into the Design workspace. This component is a thin full-bleed
   wrapper that forwards its props to <DesignStudio>, which is
   self-contained (own players, own gallery, own composer).
   ══════════════════════════════════════════════════════════════════════ */

export function CreativeStudio({ account, onRegisterDesignChatDispatch, designModelState, onSwitchDesignModel, userName, userAvatarUrl }: {
  account?: AccountInfo | null;
  // Threaded to the Design Studio dock's <Chat lane="design">: App routes
  // design-lane host events here, and passes the operator name/avatar. The
  // model/credit state feeds Design Studio's own top bar.
  onRegisterDesignChatDispatch?: (dispatch: (msg: ExtToDashboardMessage) => void) => void;
  designModelState?: DesignModelState;
  onSwitchDesignModel?: (id: string) => void;
  userName?: string | null;
  userAvatarUrl?: string | null;
}) {
  // Break out of <main>'s p-8 and fill it exactly (h-full) so the design
  // workspace is full-bleed and the page never scrolls — only the inspector.
  return (
    <div className="w-[calc(100%+4rem)] flex flex-col -m-8 h-[calc(100%+4rem)] min-h-0 overflow-hidden">
      {/* The spinner deliberately copies Design Studio's own, so the handoff
          from "chunk loading" to "page loading its gallery" is one continuous
          state rather than two different-looking waits. Reading a local file
          off disk, this is usually a single frame — but unlike a tab switch
          it IS a real fetch, so a plain spinner works here and does not need
          a transition to become visible. */}
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <div
              className="animate-spin"
              style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--border-card)', borderTopColor: 'var(--accent)' }}
              role="status"
              aria-label="Loading"
            />
          </div>
        }
      >
        <DesignStudio account={account} onRegisterDesignChatDispatch={onRegisterDesignChatDispatch} designModelState={designModelState} onSwitchDesignModel={onSwitchDesignModel} userName={userName} userAvatarUrl={userAvatarUrl} />
      </Suspense>
    </div>
  );
}
