import type { AccountInfo, ExtToDashboardMessage, ChatModel, ChatPlatformStatus } from '../types/messages';
import { DesignStudio } from './DesignStudio';

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
      <DesignStudio account={account} onRegisterDesignChatDispatch={onRegisterDesignChatDispatch} designModelState={designModelState} onSwitchDesignModel={onSwitchDesignModel} userName={userName} userAvatarUrl={userAvatarUrl} />
    </div>
  );
}
