import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      errorInfo,
    });
    // Log unexpected client-side error cleanly
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught client error:', error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-8 shadow-2xl backdrop-blur-sm text-center">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              Something went wrong
            </h1>

            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              We encountered an unexpected error while rendering this page.
              Our technical team has been notified. You can try refreshing the page or returning home.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-xl transition-colors shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Page
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-700/70 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-xl transition-colors border border-slate-600/50 cursor-pointer"
              >
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </button>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="text-left mt-4 p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs font-mono text-slate-400 overflow-auto max-h-40">
                <summary className="cursor-pointer text-amber-400/90 hover:text-amber-300 font-medium mb-1">
                  Development Error Details
                </summary>
                <p className="text-rose-400 font-semibold mb-1">{this.state.error.toString()}</p>
                <pre className="text-slate-500 whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
