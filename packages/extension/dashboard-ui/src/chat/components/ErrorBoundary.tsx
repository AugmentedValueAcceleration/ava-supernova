import { Component } from 'react';
import type { ReactNode, ErrorInfo, PropsWithChildren } from 'react';
import { t } from '../../i18n';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Ava ErrorBoundary]', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center"
          role="alert"
        >
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="opacity-40">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm-.5-3h1v1h-1v-1zm0-6h1v5h-1V5z" />
          </svg>
          <p className="text-sm font-semibold opacity-70">{t('error_boundary.title')}</p>
          <p className="text-xs opacity-40 max-w-[300px]">
            {this.state.error?.message ?? t('error_boundary.fallback')}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white cursor-pointer border-none transition"
            style={{ background: 'var(--accent)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#9333EA')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            {t('error_boundary.reset')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
