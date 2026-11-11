export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra';
export type WeatherMode = 'day' | 'sunset' | 'storm' | 'fog';
export type WeaponType = 'tnt' | 'c4' | 'rpg' | 'shotgun' | 'welder';
export type CompartmentId = 'bow' | 'midFwd' | 'midAft' | 'stern';
export type CameraMode = 'fpv' | 'orbit' | 'cinematic';

export interface GraphicsSettings {
  preset: GraphicsPreset;
  resolutionScale: number; // 0.5 to 1.5
  fov: number; // 60 to 110
  shadowQuality: 'off' | 'low' | 'medium' | 'ultra';
  waterQuality: 'low' | 'medium' | 'high' | 'ultra';
  particleDensity: number; // 0.25 to 2.0
  antiAliasing: boolean;
  weather: WeatherMode;
  showFps: boolean;
  autoScaleFps: boolean;
  cameraShake: boolean;
  showCollisionDebug: boolean;
}

export interface AudioSettings {
  masterVolume: number; // 0 to 1
  sfxVolume: number; // 0 to 1
  alarmVolume: number; // 0 to 1
  ambientVolume: number; // 0 to 1
  muted: boolean;
}

export interface ControlSettings {
  mouseSensitivity: number; // 0.2 to 3.0
  invertY: boolean;
  touchControlsMode: 'auto' | 'on' | 'off';
  touchScale: number; // 0.8 to 1.4
}

export interface WeaponInfo {
  id: WeaponType;
  key: string;
  name: string;
  shortName: string;
  description: string;
  damage: string;
  color: string;
}

export interface CompartmentTelemetry {
  id: CompartmentId;
  name: string;
  shortCode: string;
  floodPercent: number; // 0 to 100
  breachCount: number;
  hullIntegrity: number; // 0 to 100
  waterLevelLocalY: number;
}

export interface InteractablePrompt {
  id: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  lockActionLabel?: string;
  type: 'door' | 'bulkhead' | 'terminal' | 'bilge' | 'alarm' | 'analyzer' | 'ammo' | 'helm' | 'lifeboat';
  isLocked?: boolean;
  isOpen?: boolean;
  isLocking?: boolean;
  lockProgress?: number;
  watertight?: boolean;
}

export interface PlantedChargeUI {
  id: string;
  type: 'tnt' | 'c4';
  remainingTime: number;
  deckLabel: string;
}

export interface ShipTelemetry {
  fps: number;
  frameTimeMs: number;
  totalFloodPercent: number;
  sinkDepthMeters: number;
  pitchDeg: number;
  rollDeg: number;
  hullIntegrity: number;
  activeBreaches: number;
  waterIngressRate: number; // m³/s
  bilgePumpsOn: boolean;
  generalAlarmOn: boolean;
  engineRunning: boolean;
  shipBrokenInHalf: boolean;
  shipStatus: 'NOMINAL' | 'FLOODING' | 'CRITICAL LIST' | 'SINKING FAST' | 'KEEL BREAK' | 'SUNK';
  playerDeckName: string;
  playerLocalPos: { x: number; y: number; z: number };
  playerUnderwater: boolean;
  flashlightOn: boolean;
  cameraMode: CameraMode;
  activeWeapon: WeaponType;
  nearbyInteractable: InteractablePrompt | null;
  plantedCharges: PlantedChargeUI[];
  c4Count: number;
  totalExplosions: number;
  doorsCount: { open: number; total: number };
  doorLockHoldProgress?: number;
  bendingStressPercent?: number;
  compartments: Record<CompartmentId, CompartmentTelemetry>;
  bulkheadDoorsOpen: [boolean, boolean, boolean]; // A-B, B-C, C-D
  overchargedAmmoUnlocked: boolean;
  lastEventMessage: string;
}

export const WEAPONS_LIST: WeaponInfo[] = [
  {
    id: 'tnt',
    key: '1',
    name: 'Timed Dynamite Charge (TNT 5s)',
    shortName: 'TNT PACK',
    description: 'Heavy explosive charge with a 5-second timer. Ideal for hulls, bulkheads & doors.',
    damage: 'EXTREME (HULL BREACH)',
    color: '#EF4444',
  },
  {
    id: 'c4',
    key: '2',
    name: 'C4 Remote Detonation Charge',
    shortName: 'C4 + DETONATOR',
    description: 'Sticky charge with a radio detonator. Place up to 15 charges and detonate them all with [G] / right-click!',
    damage: 'CHAIN REACTION',
    color: '#F59E0B',
  },
  {
    id: 'rpg',
    key: '3',
    name: 'Heavy Naval Grenade Launcher',
    shortName: 'M32 GRENADE LAUNCHER',
    description: 'Fires high-explosive shaped charges at range against hulls, containers & barrels.',
    damage: 'HIGH (RANGED)',
    color: '#F97316',
  },
  {
    id: 'shotgun',
    key: '4',
    name: 'Tactical Breacher Shotgun',
    shortName: 'MK-18 BREACHER',
    description: 'Blasts door locks, crates and red fuel barrels open with precision.',
    damage: 'MEDIUM (KINETIC)',
    color: '#38BDF8',
  },
  {
    id: 'welder',
    key: '5',
    name: 'Plasma Welder & Repair',
    shortName: 'WELDER',
    description: 'Seals hull leaks (damage control!) or cuts open blocked doors.',
    damage: 'REPAIR / CUT',
    color: '#10B981',
  },
];

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  preset: 'high',
  resolutionScale: 1.0,
  fov: 78,
  shadowQuality: 'medium',
  waterQuality: 'high',
  particleDensity: 1.0,
  antiAliasing: true,
  weather: 'sunset',
  showFps: true,
  autoScaleFps: true,
  cameraShake: true,
  showCollisionDebug: false,
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.75,
  sfxVolume: 0.85,
  alarmVolume: 0.65,
  ambientVolume: 0.6,
  muted: false,
};

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  mouseSensitivity: 1.0,
  invertY: false,
  touchControlsMode: 'auto',
  touchScale: 1.0,
};
