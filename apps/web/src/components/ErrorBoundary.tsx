import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center p-6 bg-slate-950 text-white">
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 max-w-sm w-full text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2">Terjadi Kesalahan Kritis</h2>
            <p className="text-white/70 text-sm mb-4">Aplikasi mengalami kendala dan tidak dapat dilanjutkan.</p>
            <div className="bg-black/40 p-3 rounded-xl text-left font-mono text-[10px] text-red-300 overflow-x-auto break-all">
              {this.state.error?.message || 'Unknown error occurred'}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 w-full bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 transition-colors"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
