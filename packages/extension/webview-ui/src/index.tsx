import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
