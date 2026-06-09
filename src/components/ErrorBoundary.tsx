import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-background">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            onClick={() => window.location.replace('/')}
            className="mt-2 px-6 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm"
          >
            Go home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
