import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: string | null; stack: string | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, stack: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message, stack: null };
  }

  /**
   * Keep the component stack. Without this the boundary showed a message and
   * threw away the only part that says WHERE — so a hook-order fault, which
   * names no file and no line, could only be found by reading every component
   * by hand. That is exactly how it went: a whole afternoon of auditing files
   * that turned out to be fine.
   *
   * Also logged, because the panel truncates and the devtools console does not.
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ava] dashboard crashed:', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="text-2xl mb-2">{t('error_boundary.title')}</div>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-md">
            {t('error_boundary.fallback')}
          </p>
          {this.state.error && (
            <pre className="text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-lg p-3 max-w-md overflow-auto">
              {this.state.error}
            </pre>
          )}
          {/* The component stack — the half that says where. Scrollable and
              selectable so it can be copied into a bug report rather than
              retyped from a screenshot. */}
          {this.state.stack && (
            <pre className="mt-2 text-[10px] leading-relaxed text-left text-[var(--text-muted)] bg-[var(--bg-input)] rounded-lg p-3 max-w-md max-h-48 overflow-auto select-text">
              {this.state.stack.trim()}
            </pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, stack: null })}
            className="mt-4 px-4 py-2 text-xs rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition"
          >
            {t('error_boundary.reset')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
