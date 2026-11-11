import { Component, StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import CrashScreen, { CrashInfo, toCrashInfo } from "./ui/CrashScreen";

class Boundary extends Component<{ children: ReactNode }, { info: CrashInfo | null }> {
  state: { info: CrashInfo | null } = { info: null };
  static getDerivedStateFromError(e: unknown) {
    return { info: toCrashInfo(e, "React-Oberfläche") };
  }
  componentDidCatch(e: unknown, i: ErrorInfo) {
    console.error("UI crash", e, i.componentStack);
  }
  render() {
    if (this.state.info) {
      return (
        <CrashScreen
          info={this.state.info}
          onRestart={() => this.setState({ info: null })}
          onLowGfx={() => {
            try {
              const raw = localStorage.getItem("nordwind_settings_v1");
              const s = raw ? JSON.parse(raw) : {};
              localStorage.setItem("nordwind_settings_v1", JSON.stringify({ ...s, preset: "low", resolution: 0.6, shadows: 0, water: 0, particles: 0.3, lights: 2 }));
            } catch {
              /* ignore */
            }
            location.reload();
          }}
          onMenu={() => location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>,
);
