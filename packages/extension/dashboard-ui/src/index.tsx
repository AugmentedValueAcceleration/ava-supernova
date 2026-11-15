import './index.css';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const root = document.getElementById('root');
if (root) {
  // The document viewer opens in its own tab, from this same bundle
  // (DocumentViewerPanel sets data-view="document"); loaded on demand so the
  // dashboard does not carry pdf.js and docx-preview.
  const viewer = root.dataset.view === 'document';
  const Viewer = viewer ? lazy(() => import('./DocumentViewerApp').then((m) => ({ default: m.DocumentViewerApp }))) : null;
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        {Viewer ? <Suspense fallback={null}><Viewer /></Suspense> : <App />}
      </ErrorBoundary>
    </StrictMode>,
  );
}
