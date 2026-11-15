// The document viewer's own tab (extension). The same bundle as the
// dashboard, started in viewer mode (`#root[data-view="document"]`) by
// DocumentViewerPanel. The host reads the file and sends it; this page only
// shows it.

import { useEffect, useState } from 'react';
import { post } from './vscode';
import { initLocale, loadStrings, pendingLocaleRequest } from './i18n';
import { DocumentViewer, type ViewerSource } from './components/DocumentViewer';
import type { ViewSheet } from '../../../core/dist/tools/authoring/sheet-view.js';

interface OpenMessage {
  type: 'viewer_open';
  name: string;
  folder?: string;
  locale?: string;
  kind: 'pdf' | 'docx' | 'sheet' | 'other' | 'error';
  b64?: string;
  sheets?: ViewSheet[];
  message?: string;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function DocumentViewerApp() {
  const [doc, setDoc] = useState<{ name: string; folder?: string; source: ViewerSource } | null>(null);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      const m = e.data as OpenMessage | { type: 'locale_strings'; locale: string; strings: Record<string, string> | null };
      if (m?.type === 'locale_strings') { loadStrings(m.locale, m.strings); return; }
      if (m?.type !== 'viewer_open') return;
      if (m.locale) {
        void initLocale(m.locale).then(() => {
          const want = pendingLocaleRequest();
          if (want) post({ type: 'request_locale_strings', locale: want } as never);
        });
      }
      const source: ViewerSource =
        m.kind === 'pdf' || m.kind === 'docx' ? { kind: m.kind, bytes: fromBase64(m.b64 ?? '') }
        : m.kind === 'sheet' ? { kind: 'sheet', sheets: m.sheets ?? [] }
        : m.kind === 'error' ? { kind: 'error', message: m.message ?? '' }
        : { kind: 'other' };
      setDoc({ name: m.name, folder: m.folder, source });
    };
    window.addEventListener('message', on);
    post({ type: 'viewer_ready' } as never);
    return () => window.removeEventListener('message', on);
  }, []);

  return (
    <div style={{ height: '100vh' }}>
      <DocumentViewer
        name={doc?.name ?? ''}
        folder={doc?.folder}
        source={doc?.source ?? null}
        onOpenInApp={() => post({ type: 'viewer_open_in_app' } as never)}
        onShowInFolder={() => post({ type: 'viewer_show_in_folder' } as never)}
      />
    </div>
  );
}
