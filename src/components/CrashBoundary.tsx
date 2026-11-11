import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, Download, Terminal, Cpu } from 'lucide-react';

interface CrashBoundaryProps {
  children: ReactNode;
  onRecoverSafeMode: () => void;
  onFullReset: () => void;
  simulatedCrashMessage?: string | null;
  onClearSimulatedCrash?: () => void;
}

interface CrashBoundaryState {
  hasError: boolean;
  errorTitle: string;
  errorMessage: string;
  errorStack: string;
  timestamp: string;
  isSimulated: boolean;
}

export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  constructor(props: CrashBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorTitle: '',
      errorMessage: '',
      errorStack: '',
      timestamp: '',
      isSimulated: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CrashBoundaryState> {
    return {
      hasError: true,
      errorTitle: error.name || 'CRITICAL RUNTIME EXCEPTION',
      errorMessage: error.message || 'Unknown 3D engine runtime error.',
      errorStack: error.stack || 'No stack trace available.',
      timestamp: new Date().toISOString(),
      isSimulated: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[NAVAL CRASH GUARD INTERCEPTED ERROR]:', error, errorInfo);
    this.setState({
      errorStack: `${error.stack || ''}\n\nComponent Stack:\n${errorInfo.componentStack || ''}`,
    });
  }

  componentDidMount(): void {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  private handleGlobalError = (event: ErrorEvent): void => {
    // Ignore benign ResizeObserver warnings
    if (event.message && event.message.includes('ResizeObserver')) return;
    event.preventDefault();
    this.setState({
      hasError: true,
      errorTitle: 'GLOBAL WINDOW EXCEPTION INTERCEPTED',
      errorMessage: event.message || 'A global script error was intercepted.',
      errorStack: event.error?.stack || `File: ${event.filename}:${event.lineno}:${event.colno}`,
      timestamp: new Date().toISOString(),
      isSimulated: false,
    });
  };

  private handlePromiseRejection = (event: PromiseRejectionEvent): void => {
    // Ignore pointer lock cancellation promises (happens when user presses ESC rapidly)
    const reasonStr = String(event.reason?.message || event.reason || '');
    if (
      reasonStr.includes('PointerLock') ||
      reasonStr.includes('pointer lock') ||
      reasonStr.includes('Exited') ||
      reasonStr.includes('user gesture')
    ) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    this.setState({
      hasError: true,
      errorTitle: 'UNHANDLED ASYNC PROMISE REJECTION',
      errorMessage: reasonStr || 'Async process error intercepted.',
      errorStack: event.reason?.stack || 'Async Promise Stack Guard.',
      timestamp: new Date().toISOString(),
      isSimulated: false,
    });
  };

  private handleSafeRecovery = (): void => {
    if (this.props.onClearSimulatedCrash) {
      this.props.onClearSimulatedCrash();
    }
    this.setState({
      hasError: false,
      errorTitle: '',
      errorMessage: '',
      errorStack: '',
      isSimulated: false,
    });
    this.props.onRecoverSafeMode();
  };

  private handleFullReset = (): void => {
    if (this.props.onClearSimulatedCrash) {
      this.props.onClearSimulatedCrash();
    }
    this.setState({
      hasError: false,
      errorTitle: '',
      errorMessage: '',
      errorStack: '',
      isSimulated: false,
    });
    this.props.onFullReset();
  };

  private handleDownloadCrashLog = (): void => {
    const activeMessage = this.props.simulatedCrashMessage || this.state.errorMessage;
    const report = [
      '=== MS POSEIDON VII // BLACKBOX CRASH DIAGNOSTIC LOG ===',
      `TIMESTAMP: ${this.state.timestamp || new Date().toISOString()}`,
      `STATUS: INTERCEPTED BY NAVAL CRASH-GUARD v4.2`,
      `TYP: ${this.props.simulatedCrashMessage ? 'DIAGNOSTIC TEST RUN (SIMULATED)' : this.state.errorTitle}`,
      `ERROR MESSAGE: ${activeMessage}`,
      `USER AGENT: ${navigator.userAgent}`,
      `VIEWPORT: ${window.innerWidth}x${window.innerHeight} (DPR ${window.devicePixelRatio})`,
      '--- STACK TRACE ---',
      this.state.errorStack || 'Simulated test crash to verify the crash screen (not a real error).',
      '========================================================',
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poseidon_blackbox_crashlog_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  render(): ReactNode {
    const isSimulated = Boolean(this.props.simulatedCrashMessage);
    const showCrashScreen = this.state.hasError || isSimulated;

    if (!showCrashScreen) {
      return this.props.children;
    }

    const title = isSimulated
      ? 'BLACKBOX CRASH-SYSTEM VERIFICATION (TEST MODE)'
      : this.state.errorTitle || 'CRITICAL SYSTEM FAULT INTERCEPTED';
    const message = isSimulated
      ? this.props.simulatedCrashMessage
      : this.state.errorMessage;
    const stack = isSimulated
      ? `SimulatedCrashException: manually triggered crash-guard test.\n  at NavalEngineCore.verifyCrashGuard (MS_Poseidon_Engine.ts:412:18)\n  at TelemetryWatchdog.intercept (CrashBoundary.tsx:108:9)\n  at WebGLContextSafeGuard.recoverState (RendererPipeline.ts:88:4)`
      : this.state.errorStack;

    return (
      <div className="fixed inset-0 z-[9999] bg-[#070B10] text-slate-100 flex items-center justify-center p-4 md:p-8 overflow-y-auto">
        {/* Background Hazard Grid */}
        <div
          className="fixed inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #ef4444 0, #ef4444 2px, transparent 2px, transparent 16px)',
          }}
        />

        <div className="relative w-full max-w-3xl naval-panel-danger rounded-xl p-6 md:p-8 border-2 border-red-500/70 shadow-2xl">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-red-500/30">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-lg bg-red-500/20 border border-red-500 flex items-center justify-center text-red-400 shrink-0 animate-pulse">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[11px] font-mono-tech font-bold uppercase bg-red-500 text-black rounded">
                    CRASH-GUARD ACTIVE
                  </span>
                  <span className="text-xs font-mono-tech text-red-300">
                    ERR_CODE // 0xPOSEIDON_SAFE_INTERCEPT
                  </span>
                </div>
                <h1 className="font-display text-xl md:text-2xl font-bold tracking-wider text-white mt-1">
                  {title}
                </h1>
              </div>
            </div>
            <div className="text-right font-mono-tech text-xs text-slate-400">
              <div>SHIP: MS POSEIDON VII</div>
              <div>STATUS: SAFETY STOP</div>
            </div>
          </div>

          {/* Explanation & Telemetry */}
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/40">
              <div className="text-xs font-mono-tech uppercase text-red-300 font-semibold mb-1">
                Intercepted error cause:
              </div>
              <p className="text-sm md:text-base font-medium text-white break-words">
                {message}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono-tech">
              <div className="p-3 rounded bg-slate-900/90 border border-slate-700/70 flex items-center gap-2.5">
                <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-slate-400">MEMORY GUARD</div>
                  <div className="text-emerald-400 font-semibold">DATA SECURED</div>
                </div>
              </div>
              <div className="p-3 rounded bg-slate-900/90 border border-slate-700/70 flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="text-slate-400">RESOLUTION / DEVICE</div>
                  <div className="text-slate-200 font-semibold">
                    {typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : 'AUTO'}
                  </div>
                </div>
              </div>
              <div className="p-3 rounded bg-slate-900/90 border border-slate-700/70 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-slate-400">RECOVERY</div>
                  <div className="text-amber-300 font-semibold">READY INSTANTLY</div>
                </div>
              </div>
            </div>

            {/* Stack Trace Box */}
            <div>
              <div className="text-xs font-mono-tech text-slate-400 uppercase mb-1.5 flex items-center justify-between">
                <span>Diagnostic stack trace (blackbox dump):</span>
                <span>UTF-8 // RAW</span>
              </div>
              <pre className="p-3.5 rounded-lg bg-black/80 border border-slate-800 text-xs font-mono-tech text-amber-300/90 overflow-x-auto max-h-40 naval-scroll whitespace-pre-wrap">
                {stack}
              </pre>
            </div>
          </div>

          {/* Recovery Action Buttons */}
          <div className="mt-6 pt-5 border-t border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleSafeRecovery}
                className="px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 cursor-pointer transition"
              >
                <ShieldCheck className="w-5 h-5" />
                RESUME SIMULATION (SAFE MODE)
              </button>

              <button
                onClick={this.handleFullReset}
                className="px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-display font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <RefreshCw className="w-4 h-4" />
                FULL SHIP RESET
              </button>
            </div>

            <button
              onClick={this.handleDownloadCrashLog}
              className="px-4 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono-tech text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Download className="w-4 h-4 text-sky-400" />
              SAVE LOG AS .TXT
            </button>
          </div>
        </div>
      </div>
    );
  }
}
