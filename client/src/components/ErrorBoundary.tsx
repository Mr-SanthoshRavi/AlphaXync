import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-14 h-14 rounded-2xl bg-error-container text-error flex items-center justify-center mb-4 shadow-lg">
            <span className="material-symbols-outlined text-3xl">sync_problem</span>
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">Display Reconnection</h2>
          <p className="text-sm text-on-surface-variant max-w-md mb-6">
            A temporary display sync occurred. Click below to refresh the console interface.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:opacity-90 transition-all shadow-md active:scale-98 cursor-pointer"
          >
            Reload Interface
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
