import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: string | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="text-2xl mb-2">Something went wrong</div>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-md">
            The dashboard encountered an error. Try reloading the panel.
          </p>
          {this.state.error && (
            <pre className="text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-lg p-3 max-w-md overflow-auto">
              {this.state.error}
            </pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 text-xs rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
