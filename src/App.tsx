import { useRef, useState } from 'react';
import {
  AudioSettings,
  ControlSettings,
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_GRAPHICS_SETTINGS,
  GraphicsSettings,
  ShipTelemetry,
} from './types/game';
import { CrashBoundary } from './components/CrashBoundary';
import {
  MaritimeViewport3D,
  SimulationCommandRef,
} from './components/MaritimeViewport3D';
import { NavalHudOverlay } from './components/NavalHudOverlay';
import { TouchControlsOverlay } from './components/TouchControlsOverlay';
import { SettingsModal } from './components/SettingsModal';
import { PhotoTxtAnalyzerModal } from './components/PhotoTxtAnalyzerModal';

const INITIAL_TELEMETRY: ShipTelemetry = {
  fps: 60,
  frameTimeMs: 16.6,
  totalFloodPercent: 0,
  sinkDepthMeters: 0,
  pitchDeg: 0,
  rollDeg: 0,
  hullIntegrity: 100,
  activeBreaches: 0,
  waterIngressRate: 0,
  bilgePumpsOn: false,
  generalAlarmOn: false,
  engineRunning: true,
  shipBrokenInHalf: false,
  shipStatus: 'NOMINAL',
  playerDeckName: 'Main Deck // Container Cargo Deck',
  playerLocalPos: { x: 0, y: 2.2, z: 17.5 },
  playerUnderwater: false,
  flashlightOn: false,
  cameraMode: 'fpv',
  activeWeapon: 'tnt',
  nearbyInteractable: null,
  plantedCharges: [],
  c4Count: 0,
  totalExplosions: 0,
  doorsCount: { open: 0, total: 12 },
  compartments: {
    bow: {
      id: 'bow',
      name: 'Section A // Bow Cargo Hold',
      shortCode: 'SEC-A (BOW)',
      floodPercent: 0,
      breachCount: 0,
      hullIntegrity: 100,
      waterLevelLocalY: -2.2,
    },
    midFwd: {
      id: 'midFwd',
      name: 'Section B // Midship Cargo Hold',
      shortCode: 'SEC-B (CARGO)',
      floodPercent: 0,
      breachCount: 0,
      hullIntegrity: 100,
      waterLevelLocalY: -2.2,
    },
    midAft: {
      id: 'midAft',
      name: 'Section C // Main Engine Room',
      shortCode: 'SEC-C (ENGINE)',
      floodPercent: 0,
      breachCount: 0,
      hullIntegrity: 100,
      waterLevelLocalY: -2.2,
    },
    stern: {
      id: 'stern',
      name: 'Section D // Stern & Shaft Tunnel',
      shortCode: 'SEC-D (STERN)',
      floodPercent: 0,
      breachCount: 0,
      hullIntegrity: 100,
      waterLevelLocalY: -2.2,
    },
  },
  bulkheadDoorsOpen: [false, false, false],
  overchargedAmmoUnlocked: false,
  lastEventMessage:
    'MS POSEIDON VII ready. All 12 doors & bulkheads operable with [E] (no clipping!).',
};

export function App() {
  const [graphics, setGraphics] = useState<GraphicsSettings>(DEFAULT_GRAPHICS_SETTINGS);
  const [audio, setAudio] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const [controls, setControls] = useState<ControlSettings>(DEFAULT_CONTROL_SETTINGS);
  const [telemetry, setTelemetry] = useState<ShipTelemetry>(INITIAL_TELEMETRY);

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isPhotoAnalyzerOpen, setIsPhotoAnalyzerOpen] = useState<boolean>(false);
  const [overchargedUnlocked, setOverchargedUnlocked] = useState<boolean>(false);
  const [simulatedCrashMessage, setSimulatedCrashMessage] = useState<string | null>(null);

  const commandRef = useRef<SimulationCommandRef | null>(null);

  const handleRecoverSafeMode = () => {
    setSimulatedCrashMessage(null);
    setGraphics((prev) => ({
      ...prev,
      preset: 'low',
      resolutionScale: 0.7,
      shadowQuality: 'off',
      waterQuality: 'low',
      particleDensity: 0.5,
      antiAliasing: false,
    }));
  };

  const handleFullReset = () => {
    setSimulatedCrashMessage(null);
    commandRef.current?.triggerResetShip();
  };

  return (
    <CrashBoundary
      onRecoverSafeMode={handleRecoverSafeMode}
      onFullReset={handleFullReset}
      simulatedCrashMessage={simulatedCrashMessage}
      onClearSimulatedCrash={() => setSimulatedCrashMessage(null)}
    >
      <div className="relative w-full h-full overflow-hidden bg-[#0B1017] select-none">
        {/* Full-Viewport 3D WebGL Cargo Ship & Ocean Simulation */}
        <MaritimeViewport3D
          graphics={graphics}
          audio={audio}
          controls={controls}
          overchargedUnlocked={overchargedUnlocked}
          isModalOpen={isSettingsOpen || isPhotoAnalyzerOpen || Boolean(simulatedCrashMessage)}
          onUpdateTelemetry={setTelemetry}
          onOpenPhotoAnalyzer={() => setIsPhotoAnalyzerOpen(true)}
          commandRef={commandRef}
        />

        {/* Industrial Naval Instrument HUD Overlay */}
        <NavalHudOverlay
          telemetry={telemetry}
          graphics={graphics}
          audio={audio}
          onToggleMute={() => setAudio((prev) => ({ ...prev, muted: !prev.muted }))}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenPhotoAnalyzer={() => setIsPhotoAnalyzerOpen(true)}
          commandRef={commandRef}
        />

        {/* Responsive Touch Controls Overlay for Mobile / Tablet / Touchscreen */}
        <TouchControlsOverlay
          controls={controls}
          nearbyInteractable={telemetry.nearbyInteractable}
          c4Count={telemetry.c4Count}
          commandRef={commandRef}
        />

        {/* Tabbed Graphics, Audio, Controls & Crash-Guard Test Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          graphics={graphics}
          onChangeGraphics={setGraphics}
          audio={audio}
          onChangeAudio={setAudio}
          controls={controls}
          onChangeControls={setControls}
          onTriggerSimulatedCrash={() =>
            setSimulatedCrashMessage(
              'Manual diagnostic test: crash guard triggered successfully. Click "RESUME SIMULATION" below to continue seamlessly!'
            )
          }
        />

        {/* Interactive .JPG/.PNG -> .TXT Renamer & Blackbox Decoder Modal */}
        <PhotoTxtAnalyzerModal
          isOpen={isPhotoAnalyzerOpen}
          onClose={() => setIsPhotoAnalyzerOpen(false)}
          overchargedUnlocked={overchargedUnlocked}
          onUnlockOvercharged={() => setOverchargedUnlocked(true)}
          onTriggerInstantKeelBreach={() => commandRef.current?.triggerInstantKeelBreach()}
        />
      </div>
    </CrashBoundary>
  );
}

export default App;
