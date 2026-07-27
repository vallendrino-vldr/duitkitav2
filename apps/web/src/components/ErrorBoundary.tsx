import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  pesan: string;
}

/** Mengubah apa pun menjadi teks; objek galat tidak boleh sampai ke JSX. */
function keTeks(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    for (const k of ['message', 'error', 'msg']) {
      if (typeof o[k] === 'string') return o[k] as string;
    }
    try { return JSON.stringify(e); } catch { /* objek melingkar */ }
  }
  return 'Penyebab tidak diketahui';
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, pesan: '' };

  public static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, pesan: keTeks(error) };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[FATAL] komponen jatuh:', error, errorInfo);
  }

  private coba = () => {
    // Coba pulih tanpa memuat ulang seluruh aplikasi. Untuk galat sesaat
    // (satu permintaan gagal), ini jauh lebih cepat daripada reload penuh.
    this.setState({ hasError: false, pesan: '' });
  };

  private keBeranda = () => {
    window.location.href = '/dashboard';
  };

  public render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 bg-ink-950 text-white">
        <div className="glass rounded-4xl p-6 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-danger-500/20 text-danger-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={26} />
          </div>

          <h2 className="text-xl font-bold mb-2">Ada yang Bermasalah</h2>
          <p className="text-white/75 text-sm mb-4">
            Sebagian aplikasi berhenti bekerja. Datamu aman — tidak ada yang hilang.
          </p>

          <details className="text-left">
            <summary className="text-micro text-white/60 cursor-pointer mb-2 select-none">
              Lihat detail teknis
            </summary>
            <div className="bg-black/40 p-3 rounded-xl font-mono text-[10px] text-danger-400 overflow-x-auto break-all max-h-32">
              {this.state.pesan}
            </div>
          </details>

          {/* Dua jalan keluar, bukan satu tombol reload buntu. */}
          <div className="flex gap-3 mt-6">
            <button onClick={this.coba} className="btn-ghost flex-1">
              <RotateCw size={16} /> Coba Lagi
            </button>
            <button onClick={this.keBeranda} className="btn-primary flex-1">
              <Home size={16} /> Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }
}
