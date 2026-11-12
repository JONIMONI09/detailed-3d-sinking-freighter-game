import * as THREE from "three";
import { AudioEngine } from "./audio";
import { Sky, computeEnv, Env } from "./environment";
import { Ocean } from "./ocean";
import { ParticleSystem, createRain } from "./particles";
import { Input } from "./input";
import { Player } from "./player";
import { buildShip, ShipModel } from "./shipBuilder";
import { ShipSim } from "./shipSim";
import { Compartment, DECK_Y, Door, Lifeboat, WI } from "./shipTypes";
import type { Settings } from "./settings";
import { createTextures, setAnisotropy, TexSet } from "./textures";
import { ViewModel, WEAPONS, WeaponId } from "./weapons";
import { Guard } from "./enemies";
import { rayAABB } from "./physics";
import { DoorSecurity, TerminalEntry, TerminalLog } from "./doorSecurity";
import type { SecurityContext } from "./doorSecurity";
import { StormworksSupervisor } from "./stormworksSupervisor";
import { stepTelegraph, MAX_RUDDER_DEG, TELEGRAPH_SPEED } from "./bridge";
import { shouldWindowBurst } from "./ingress";
import { v3 } from "./navmesh3d";
import { CrewVisual } from "./crewVisual";
import { Battleship, createBattleship, stepBattleship, stepBattleshipAI, damageBattleship, fireBattleshipSalvo } from "./battleships";
import { OrbitalSpaceStationSim, STATION_BASE_Y } from "./spaceStation";

export type Mode = "mission" | "sandbox";

export interface HudState {
  hp: number;
  armor: number;
  weapon: WeaponId;
  weaponName: string;
  mag: number;
  reserve: number;
  tnt: number;
  owned: Record<WeaponId, boolean>;
  oxygen: number;
  underwater: boolean;
  wading: boolean;
  prompt: string;
  promptKind: "" | "normal" | "locked" | "confirm";
  objectives: { text: string; done: boolean }[];
  messages: { id: number; text: string; kind: string }[];
  flood: { name: string; fill: number; flow: number }[];
  F: number;
  sinking: boolean;
  tilt: number;
  pitchDeg: number;
  rollDeg: number;
  alarm: boolean;
  fps: number;
  hit: number;
  dmg: number;
  keys: { red: boolean; blue: boolean };
  armedMarkers: number;
  planted: number;
  mode: Mode;
  time: number;
  kills: number;
  reloading: boolean;
  chase: boolean;
  heading: number;
  escape: boolean;
  detonatable: boolean;
  sprint: boolean;
  crouch: boolean;
  locked: boolean;
  dragMode: boolean;
  sunk: boolean;
  guardsAlive: number;
  terminal: TerminalEntry[];
  terminalPinned: boolean;
  godMode: boolean;
  godModeHoldProgress: number;
  tabletOpen: boolean;
  activeVessel: "freighter" | "battleship";
  vesselSpeed: number;
  vesselRudder: number;
  vesselTelegraph: string;
  battleshipHp: number;
  battleshipAvailable: boolean;
  torpCd: number;
  cannonCd: number;
  missileCd: number;
  freighterDist: number;
  battleshipCount: number;
  fleetBattle: boolean;
  theatre: "maritime" | "orbital";
  orbitalLaserMode: boolean;
  orbitalZoomFov: number;
}

export interface EndInfo {
  kind: "dead" | "win" | "drown";
  cause: string;
  time: number;
  kills: number;
  flood: number;
  mode: Mode;
}

export interface GameCallbacks {
  onHud: (h: HudState) => void;
  onEnd: (e: EndInfo) => void;
  onCrash: (e: unknown) => void;
  onPause: () => void;
  onProgress?: (p: number, label: string) => void;
}

interface Dyn {
  mesh: THREE.Group;
  body: { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; h: number; onGround: boolean; step: number };
  fuse: number;
  resting: boolean;
  beep: number;
  spark: number;
  led: THREE.Mesh;
  placedMarker: boolean;
  remote: number;
}

interface Effect {
  update: (dt: number) => boolean;
  dispose?: () => void;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Game {
  host: HTMLElement;
  settings: Settings;
  mode: Mode;
  cb: GameCallbacks;

  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.08, 4000);
  vmScene = new THREE.Scene();
  vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  tex!: TexSet;
  sky!: Sky;
  ocean!: Ocean;
  env!: Env;
  ship!: ShipModel;
  sim!: ShipSim;
  supervisor!: StormworksSupervisor;
  audio = new AudioEngine();
  input = new Input();
  player = new Player();
  vm!: ViewModel;
  pn!: ParticleSystem;
  pa!: ParticleSystem;
  rain!: THREE.LineSegments;
  hemi!: THREE.HemisphereLight;
  sun!: THREE.DirectionalLight;
  lampPool: THREE.PointLight[] = [];
  flashLights: THREE.PointLight[] = [];
  muzzleLight!: THREE.PointLight;
  flashlight!: THREE.SpotLight;
  guards: Guard[] = [];
  dyns: Dyn[] = [];
  effects: Effect[] = [];
  gulls: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; r: number; h: number; a: number; s: number; ph: number }[] = [];

  // Zustand
  raf = 0;
  running = false;
  paused = false;
  time = 0;
  lastT = 0;
  dead = false;
  deadT = 0;
  ended = false;
  kills = 0;
  fpsAcc = 0;
  fpsN = 0;
  fps = 60;
  fpsTimer = 0;
  dynRes = 1;
  lastResChange = 0;
  hudTimer = 0;
  msgId = 1;
  msgs: { id: number; text: string; kind: string; t: number }[] = [];
  dmgFlash = 0;
  hitMarker = 0;
  shake = 0;
  noiseT = 0;
  noisePos = V();
  noiseRange = 1;
  indoor = 0;
  flashOn = false;
  alarm = false;
  gullTimer = 5;
  creakTimer = 8;
  smokeT = 0;
  foamT = 0;
  hasKey = { red: false, blue: false };
  owned: Record<WeaponId, boolean> = { pistol: true, shotgun: false, rifle: false, tnt: true };
  ammo = { pistol: { mag: 12, res: 36 }, shotgun: { mag: 0, res: 0 }, rifle: { mag: 0, res: 0 } };
  tnt = 4;
  cur: WeaponId = "pistol";
  last: WeaponId = "pistol";
  cooldown = 0;
  reloadT = 0;
  reloading = false;
  shellLoad = false;
  bloom = 0;
  detonated = false;
  armedCount = 0;
  escapeState: null | { boat: Lifeboat; t: number; phase: number; startPos: THREE.Vector3; dir: THREE.Vector3; speed: number } = null;
  prompt = "";
  promptKind: "" | "normal" | "locked" | "confirm" = "";
  promptTarget: null | (() => void) = null;
  /** Terminal log of all door operations and security decisions. */
  terminal = new TerminalLog(64, (e) => console.debug(`[NORDWIND/${e.source}] t=${e.time.toFixed(1)}s ${e.level.toUpperCase()} ${e.text}`));
  doorSecurity = new DoorSecurity(this.terminal);
  terminalPinned = false;
  tracers: { line: THREE.Line; t: number }[] = [];
  holes: THREE.Object3D[] = [];
  holeIdx = 0;
  scorch: THREE.Mesh[] = [];
  scorchIdx = 0;
  lockOk = false;
  dragMode = false;
  disposed = false;
  headLight = 0;
  camShake = V();
  lastLookDX = 0;
  lastLookDY = 0;
  waterOverlay = false;
  godModeHoldProgress = 0;
  crewVisuals: CrewVisual[] = [];
  battleships: Battleship[] = [];
  helmMode = false;
  helmThrottleCooldown = 0;
  tabletOpen = false;
  activeVessel: "freighter" | "battleship" = "freighter";
  bsFireCd = 0;
  bsTorpCd = 0;
  bsMissileCd = 0;
  fleetBattle = false;
  theatre: "maritime" | "orbital" = "maritime";
  orbitalLaserMode = false;
  orbitalZoomFov = 55;
  orbitalAimX = 0;
  orbitalAimZ = 0;
  laserCd = 0;
  activeFires: { pos: THREE.Vector3; life: number; spreadCd: number }[] = [];
  debris: { m: THREE.Mesh; vel: THREE.Vector3; rot: THREE.Vector3; life: number }[] = [];
  spaceStation!: OrbitalSpaceStationSim;
  navalProjectiles: { mesh: THREE.Mesh; pos: THREE.Vector3; vel: THREE.Vector3; kind: "shell" | "torpedo" | "missile"; life: number; ownerIdx?: number }[] = [];
  engineExploded = false;
  private tmpV = V();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private resizeObs?: ResizeObserver;
  private onResize = () => this.resize();
  private onLockChange = () => {
    this.lockOk = document.pointerLockElement === this.renderer?.domElement;
    this.input.locked = this.lockOk;
    if (!this.lockOk && this.running && !this.paused && !this.dead && !this.escapeState && !this.dragMode && !this.tabletOpen && !this.isTouch()) this.cb.onPause();
  };
  private onLockError = () => {
    this.dragMode = true;
    this.input.dragLook = true;
    this.say("Mouse capture unavailable – hold and drag the mouse to look around.", "warn");
  };
  private onVis = () => {
    if (document.hidden && this.running && !this.paused) this.cb.onPause();
  };
  private onFirstGesture = () => this.audio.resume();
  private lostHandler = (e: Event) => {
    e.preventDefault();
    this.fail(new Error("WebGL context lost (GPU memory/driver). Reduce graphics and restart."));
  };

  constructor(host: HTMLElement, settings: Settings, mode: Mode, cb: GameCallbacks) {
    this.host = host;
    this.settings = settings;
    this.mode = mode;
    this.cb = cb;
  }

  isTouch(): boolean {
    const s = this.settings.touch;
    if (s === "on") return true;
    if (s === "off") return false;
    try {
      return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ Aufbau
  init() {
    const s = this.settings;
    const prog = (p: number, l: string) => this.cb.onProgress?.(p, l);
    prog(0.05, "Initializing graphics …");
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none;outline:none";
    canvas.tabIndex = 0;
    this.host.appendChild(canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: s.antialias, powerPreference: "high-performance" });
    } catch (e) {
      throw new Error("WebGL could not start. Your device/browser may not support WebGL or it is disabled. (" + (e instanceof Error ? e.message : String(e)) + ")");
    }
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.localClippingEnabled = true;
    r.autoClear = false;
    canvas.addEventListener("webglcontextlost", this.lostHandler);
    setAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.resize();

    prog(0.15, "Textures …");
    this.tex = createTextures(s.preset === "low" ? 256 : 512);

    prog(0.25, "Sky & Ocean …");
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.ocean = new Ocean();
    this.scene.add(this.ocean.mesh);
    this.scene.add(this.camera);

    // Lichter
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 60, 1.6);
      this.scene.add(l);
      this.flashLights.push(l);
    }
    this.muzzleLight = new THREE.PointLight(0xffcc77, 0, 14, 1.8);
    this.camera.add(this.muzzleLight);
    this.muzzleLight.position.set(0.2, -0.1, -0.6);
    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 40, 0.5, 0.45, 1.2);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
    this.flashlight.position.set(0.15, -0.12, 0);
    this.flashlight.target.position.set(0, 0, -5);

    prog(0.4, "Building freighter …");
    this.ship = buildShip(this.tex, { sandbox: this.mode === "sandbox" });
    this.scene.add(this.ship.group, this.ship.waterGroup);
    this.ship.group.add(this.ship.holeGroup);
    this.sim = new ShipSim(this.ship.group, this.ship.compartments);
    this.supervisor = new StormworksSupervisor(this.sim, this.ship.compartments, this.ship.doors);
    this.spaceStation = new OrbitalSpaceStationSim(this.scene, this.ship.world);
    this.ship.doors.forEach((d) => {
      d.onEvent = (e, door) => {
        const pos = this.posAudio(door.center);
        if (e === "open") this.audio.door(door.kind === "slide" ? "slide" : "open", pos);
        else if (e === "close") this.audio.door(door.kind === "slide" ? "slide" : "close", pos);
        else if (e === "unlock") this.audio.unlock();
        this.doorSecurity.recordEvent(door, e, this.securityContext());
      };
    });
    this.terminal.push(0, "info", "SYS", `Door security online: ${this.ship.doors.length} doors, ${this.ship.doors.filter((d) => d.bulkhead).length} watertight bulkheads monitored`);

    prog(0.6, "Effects …");
    this.pn = new ParticleSystem(4000, false);
    this.pa = new ParticleSystem(3000, true);
    this.scene.add(this.pn.points, this.pa.points);
    this.rain = createRain(1800);
    this.rain.visible = false;
    this.scene.add(this.rain);
    this.buildGulls();
    this.buildDecalPools();

    prog(0.75, "Weapons …");
    this.vm = new ViewModel(this.tex.glow);
    this.vm.root.scale.setScalar(0.8);
    this.vmScene.add(this.vm.root);
    this.vmScene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const vl = new THREE.DirectionalLight(0xffffff, 2.2);
    vl.position.set(0.4, 1, 0.8);
    this.vmScene.add(vl);
    this.vmScene.add(this.vmCam);

    // Wachen (mission mode only)
    if (this.mode === "mission" && s.guards) {
      for (const sp of this.ship.guardSpawns) {
        const g = new Guard(sp);
        this.ship.group.add(g.group);
        this.guards.push(g);
      }
    }

    // Friendly Damage Control Crew (sandbox mode)
    if (this.mode === "sandbox") {
      for (const m of this.supervisor.crew) {
        const cv = new CrewVisual(m);
        this.ship.group.add(cv.group);
        this.crewVisuals.push(cv);
      }
      const bs = createBattleship("bs-1", 46, -15);
      this.scene.add(bs.group);
      this.battleships.push(bs);
      console.log("[NORDWIND/SANDBOX] Spawned 3 visible crew members on deck and 1 walkable Battleship at (46, 0, -15).");
    }

    // Spieler
    this.player.teleport(9.8, DECK_Y, -42, Math.PI);
    if (this.mode === "sandbox") {
      this.supervisor.sandbox.godMode = true;
      this.owned = { pistol: true, shotgun: true, rifle: true, tnt: true };
      this.ammo = { pistol: { mag: 12, res: 120 }, shotgun: { mag: 6, res: 48 }, rifle: { mag: 30, res: 240 } };
      this.tnt = 20;
      this.hasKey = { red: true, blue: true };
      this.player.armor = 100;
      console.log("[NORDWIND/SANDBOX] Initialized Sandbox Mode: All weapons unlocked, God Mode enabled, 20 TNT, all access cards granted.");
    }
    this.vm.select(this.cur, true);

    prog(0.9, "Audio …");
    this.audio.vols = { master: s.master, sfx: s.sfx, ambient: s.ambient, music: s.music };
    this.audio.init();

    // Input
    this.input.attach(canvas);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("pointerlockerror", this.onLockError);
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointerdown", this.onFirstGesture);
    window.addEventListener("keydown", this.onFirstGesture);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(this.host);
    }

    (window as any).__game = this;
    this.applySettings(s, true);
    this.sim.update(0.016, 0, this.ocean, 1);
    this.ship.group.updateMatrixWorld(true);

    if (this.mode === "mission") {
      this.say("Welcome aboard the NORDWIND. Your mission: sink the freighter and escape in the lifeboat!", "info");
      setTimeout(() => this.say("Tip: place TNT on the orange detonation points in the hull (2 charges), then detonate with G.", "info"), 5000);
    } else {
      this.say("Sandbox mode: all weapons, 20 TNT, all doors open. Have fun!", "info");
    }
    prog(1, "Bereit");
  }

  start() {
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  requestLock() {
    if (this.isTouch()) return;
    const c = this.renderer?.domElement;
    if (!c) return;
    try {
      const p = (c as any).requestPointerLock?.();
      if (p && typeof p.catch === "function") p.catch(() => this.onLockError());
    } catch {
      this.onLockError();
    }
    c.focus();
  }

  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    if (p) {
      if (document.pointerLockElement) document.exitPointerLock();
      try {
        this.audio.ctx?.suspend();
      } catch {
        /* ignore */
      }
      this.input.clearQueue();
      this.input.held.clear();
    } else {
      this.audio.resume();
      this.lastT = performance.now();
      this.input.clearQueue();
    }
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(2, this.host.clientWidth || window.innerWidth);
    const h = Math.max(2, this.host.clientHeight || window.innerHeight);
    let pr = Math.min(window.devicePixelRatio || 1, 2) * this.settings.resolution * this.dynRes;
    const maxPix = 5.5e6;
    if (w * h * pr * pr > maxPix) pr = Math.sqrt(maxPix / (w * h));
    this.renderer.setPixelRatio(Math.max(0.35, pr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCam.aspect = w / h;
    this.vmCam.updateProjectionMatrix();
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.pn?.setScale(scale);
    this.pa?.setScale(scale);
  }

  applySettings(s: Settings, first = false) {
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.resize();
    // Schatten
    const sizes = [0, 1024, 2048, 4096];
    const ext = [0, 32, 44, 56];
    this.sun.castShadow = s.shadows > 0;
    if (s.shadows > 0) {
      const n = sizes[s.shadows];
      if (this.sun.shadow.mapSize.x !== n) {
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.sun.shadow.mapSize.set(n, n);
      }
      const e = ext[s.shadows];
      const c = this.sun.shadow.camera;
      c.left = -e;
      c.right = e;
      c.top = e;
      c.bottom = -e;
      c.updateProjectionMatrix();
    }
    this.ocean.setQuality(s.water);
    this.pn.density = Math.max(0.05, s.particles);
    this.pa.density = Math.max(0.05, s.particles);
    this.audio.setVolumes({ master: s.master, sfx: s.sfx, ambient: s.ambient, music: s.music });
    this.env = computeEnv(s.timeOfDay, s.weather);
    this.sky.apply(this.env);
    this.rain.visible = this.env.rain > 0 && s.particles > 0.1;
    this.rebuildLampPool();
    if (!first) this.say("Settings applied.", "info");
  }

  private rebuildLampPool() {
    for (const l of this.lampPool) {
      this.ship.group.remove(l);
      l.dispose();
    }
    this.lampPool = [];
    for (let i = 0; i < this.settings.lights; i++) {
      const l = new THREE.PointLight(0xfff0d0, 0, 15, 1.5);
      this.ship.group.add(l);
      this.lampPool.push(l);
    }
  }

  private buildGulls() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide });
    const wingGeo = new THREE.PlaneGeometry(1.1, 0.28);
    wingGeo.translate(0.55, 0, 0);
    const bodyGeo = new THREE.BoxGeometry(0.22, 0.16, 0.7);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, mat));
      const wl = new THREE.Mesh(wingGeo, mat);
      const wr = new THREE.Mesh(wingGeo, mat);
      wr.scale.x = -1;
      wl.position.x = 0.08;
      wr.position.x = -0.08;
      g.add(wl, wr);
      g.scale.setScalar(1.6);
      this.scene.add(g);
      this.gulls.push({ g, wl, wr, r: 45 + Math.random() * 60, h: 14 + Math.random() * 22, a: Math.random() * 6.28, s: 0.12 + Math.random() * 0.1, ph: Math.random() * 6 });
    }
  }

  private buildDecalPools() {
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const scratchMat = new THREE.MeshBasicMaterial({ color: 0x71717a, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const hg = new THREE.CircleGeometry(0.045, 8);
    const ringGeom = new THREE.RingGeometry(0.04, 0.085, 8);
    for (let i = 0; i < 70; i++) {
      const g = new THREE.Group();
      const mHole = new THREE.Mesh(hg, holeMat);
      const mScratch = new THREE.Mesh(ringGeom, scratchMat);
      mScratch.position.z = 0.001;
      g.add(mHole, mScratch);
      g.visible = false;
      this.ship.group.add(g);
      this.holes.push(g);
    }
    const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const sg = new THREE.CircleGeometry(1, 20);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(sg, sm);
      m.visible = false;
      this.ship.group.add(m);
      this.scorch.push(m);
    }
  }

  // ------------------------------------------------------------------ Hilfsfunktionen
  say(text: string, kind = "info") {
    const lastMsg = this.msgs[this.msgs.length - 1];
    if (lastMsg && lastMsg.text === text) {
      lastMsg.t = this.time + 4;
      return;
    }
    this.msgs.push({ id: this.msgId++, text, kind, t: this.time + (kind === "warn" ? 6 : 5) });
    if (this.msgs.length > 6) this.msgs.shift();
  }

  worldPos(local: THREE.Vector3, out = V()): THREE.Vector3 {
    return out.copy(local).applyMatrix4(this.ship.group.matrixWorld);
  }

  posAudio(local: THREE.Vector3): { dist: number; pan: number } {
    const w = this.worldPos(local, this.tmpV);
    const d = w.clone().sub(this.camera.position);
    const dist = d.length();
    const right = V(1, 0, 0).applyQuaternion(this.camera.quaternion);
    return { dist, pan: dist > 0.01 ? d.dot(right) / dist : 0 };
  }

  localDir(worldDir: THREE.Vector3): THREE.Vector3 {
    const q = this.ship.group.quaternion.clone().invert();
    return worldDir.clone().applyQuaternion(q);
  }

  lookDirLocal(): THREE.Vector3 {
    const p = this.player;
    this.tmpE.set(p.pitch, p.yaw, 0, "YXZ");
    return V(0, 0, -1).applyEuler(this.tmpE);
  }

  eyeLocal(): THREE.Vector3 {
    const e = this.player.eye();
    return V(e[0], e[1], e[2]);
  }

  /** lokale Wasserhöhe an Punkt (oder -Infinity) */
  waterAt = (x: number, y: number, z: number): number => {
    if (this.theatre === "orbital" || y > 120) return -Infinity;
    for (const c of this.ship.compartments) {
      if (Math.abs(x) <= WI + 0.4 && z >= c.min.z - 0.3 && z <= c.max.z + 0.3 && y >= c.min.y - 0.4 && y <= c.max.y + 0.05) {
        return c.fill > 0.004 ? this.sim.localLevel(c, x, z) : -Infinity;
      }
    }
    const m = this.ship.group.matrixWorld.elements;
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const oh = this.ocean.height(wx, wz, this.time);
    if (m[5] < 0.05) return -Infinity;
    return (oh - m[13] - m[1] * x - m[9] * z) / m[5];
  };

  compAt(x: number, y: number, z: number): Compartment | null {
    for (const c of this.ship.compartments) {
      if (x >= c.min.x - 0.5 && x <= c.max.x + 0.5 && z >= c.min.z - 0.3 && z <= c.max.z + 0.3 && y >= c.min.y - 0.5 && y <= c.max.y + 0.5) return c;
    }
    return null;
  }

  fail(e: unknown) {
    if (this.ended) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    console.error("Game crash:", e);
    this.cb.onCrash(e);
  }

  // ------------------------------------------------------------------ Hauptschleife
  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      if (!isFinite(dt) || dt < 0) dt = 0.016;
      dt = Math.min(dt, 0.05);
      if (!this.paused) {
        this.update(dt);
        this.trackFps(dt);
      }
      this.render();
    } catch (e) {
      this.fail(e);
    }
  };

  private trackFps(dt: number) {
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 1) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      if (this.settings.autoQuality) {
        this.fpsTimer++;
        if (this.fps < 26 && this.dynRes > 0.55 && this.time - this.lastResChange > 3) {
          this.dynRes = Math.max(0.5, this.dynRes - 0.12);
          this.lastResChange = this.time;
          this.resize();
        } else if (this.fps > 58 && this.dynRes < 1 && this.time - this.lastResChange > 10) {
          this.dynRes = Math.min(1, this.dynRes + 0.08);
          this.lastResChange = this.time;
          this.resize();
        }
      }
    }
  }

  private update(dt: number) {
    const inp = this.input;
    inp.pollGamepad();
    if (inp.pressed("pause")) {
      this.cb.onPause();
      return;
    }
    this.time += dt;
    const t = this.time;
    const st = this.settings;

    // Schiff
    this.supervisor.step(
      dt,
      t,
      this.ocean,
      st.floodSpeed,
      (orig, dir, maxD) => {
        const hit = this.ship.world.raycast(orig.x, orig.y, orig.z, dir.x, dir.y, dir.z, maxD);
        return {
          hit: !!hit,
          distance: hit ? hit.dist : maxD,
          normal: hit ? v3(hit.nx, hit.ny, hit.nz) : v3(0, 0, 0),
          point: hit ? v3(orig.x + dir.x * hit.dist, orig.y + dir.y * hit.dist, orig.z + dir.z * hit.dist) : v3(0, 0, 0),
        };
      },
      this.shake * 180,
      this.ship.world,
    );

    // Freighter AI evasive autopilot when player commands the Battleship (stays within 220m so it never vanishes)
    if (this.activeVessel === "battleship" && this.battleships[0] && !this.sim.sunk) {
      const bs = this.battleships[0];
      const awayX = this.ship.group.position.x - bs.baseX;
      const awayZ = this.ship.group.position.z - bs.baseZ;
      const dist = Math.hypot(awayX, awayZ);
      const desiredHeading = dist > 200
        ? Math.atan2(-awayX, -awayZ) + Math.PI * 0.55 // circle back into combat range
        : Math.atan2(-awayX, -awayZ); // flee away
      let hDiff = desiredHeading - this.supervisor.helm.heading;
      while (hDiff > Math.PI) hDiff -= Math.PI * 2;
      while (hDiff < -Math.PI) hDiff += Math.PI * 2;
      this.supervisor.helm.telegraph = "half-ahead";
      this.supervisor.helm.rudderCmd = Math.max(-MAX_RUDDER_DEG, Math.min(MAX_RUDDER_DEG, (hDiff * 180) / Math.PI));
    }

    // Real vessel propulsion and rudder steering
    const forward = v3(-Math.sin(this.supervisor.helm.heading), 0, -Math.cos(this.supervisor.helm.heading));
    this.ship.group.position.addScaledVector(forward, this.supervisor.helm.speed * dt);
    this.ship.group.updateMatrixWorld(true);

    // Step Orbital Space Station (0 CPU when inactive); keep Ocean & Ships visible far below!
    this.spaceStation.step(dt, t, false);
    this.ocean.mesh.visible = true;
    for (const bs of this.battleships) bs.group.visible = true;
    this.laserCd = Math.max(0, this.laserCd - dt);

    // Step spreading 3D fires (extinguished if flooded, capped at 18 for 60 FPS)
    for (let i = this.activeFires.length - 1; i >= 0; i--) {
      const f = this.activeFires[i];
      f.life -= dt;
      f.spreadCd -= dt;
      if (Math.random() < dt * 24) {
        this.pa.emit(f.pos.x, f.pos.y + 0.3, f.pos.z, (Math.random() - 0.5) * 1.2, 2.8 + Math.random() * 2, (Math.random() - 0.5) * 1.2, 2.2, 0.35, 0.7, 1.0, 0.45, 0.08, 0.85, 0.5, 0.5);
        this.pn.emit(f.pos.x, f.pos.y + 1.1, f.pos.z, (Math.random() - 0.5) * 0.8, 2.2, (Math.random() - 0.5) * 0.8, 2.8, 0.5, 1.4, 0.18, 0.18, 0.2, 0.45, 0.2, 0.8);
      }
      if (f.spreadCd <= 0 && this.activeFires.length < 18) {
        f.spreadCd = 2.8;
        const np = f.pos.clone().add(V((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
        this.activeFires.push({ pos: np, life: 22, spreadCd: 3.2 });
      }
      if (f.life <= 0) this.activeFires.splice(i, 1);
    }
    // Step shattered 3D ship debris pieces
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 14.5 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.rot.x * dt;
      d.m.rotation.y += d.rot.y * dt;
      d.m.rotation.z += d.rot.z * dt;
      if (d.m.position.y < -6 || d.life <= 0) {
        this.scene.remove(d.m);
        this.debris.splice(i, 1);
      }
    }
    const bsPlayerControlled = this.activeVessel === "battleship" && !this.tabletOpen;
    const bsAimDir = V(-Math.sin(this.player.yaw) * Math.cos(this.player.pitch), Math.sin(this.player.pitch), -Math.cos(this.player.yaw) * Math.cos(this.player.pitch)).normalize();
    const freighterTarget = this.ship.group.position.clone().add(V(0, 3, -10));
    for (let bi = 0; bi < this.battleships.length; bi++) {
      const bs = this.battleships[bi];
      const isPlayerShip = bi === 0 && bsPlayerControlled;
      // In Fleet Battle mode, AI Battleships maneuver & fight opposing team (or the Freighter!)
      let targetPos = freighterTarget;
      let opp: Battleship | undefined;
      if (isPlayerShip) {
        targetPos = bs.group.position.clone().addScaledVector(bsAimDir, 120);
      } else if (this.fleetBattle) {
        opp = this.battleships.find((other, oi) => oi !== bi && !other.sunk && other.team !== bs.team)
          ?? this.battleships.find((other, oi) => oi !== bi && !other.sunk);
        if (opp) targetPos = opp.group.position.clone().add(V(0, 3, 0));
        stepBattleshipAI(bs, targetPos, dt);
      }
      stepBattleship(
        bs,
        dt,
        t,
        targetPos,
        (x, z, tt) => this.ocean.height(x, z, tt),
        (muzzle, dir) => {
          this.tracer(muzzle, muzzle.clone().addScaledVector(dir, 55), bs.team === "red" ? 0xef4444 : 0x38bdf8);
          if (this.fleetBattle) {
            if (opp && muzzle.distanceTo(opp.group.position) < 280) {
              const sunkNow = damageBattleship(opp, 35 + bs.level * 14);
              this.pn.emit(opp.baseX, 4, opp.baseZ, 0, 5, 0, 3, 0.35, 0.7, 1, 0.5, 0.1, 0.7, -1, 0.8);
              if (sunkNow) this.say(`⚓ ${opp.id.toUpperCase()} (Lv.${opp.level}) SUNK by ${bs.id.toUpperCase()}!`, "alert");
            } else if (!opp && !this.sim.sunk && muzzle.distanceTo(freighterTarget) < 300) {
              this.pn.emit(freighterTarget.x, 4, freighterTarget.z, 0, 6, 0, 4, 0.4, 0.9, 1, 0.5, 0.1, 0.8, -1, 0.8);
              if (this.activeFires.length < 18 && Math.random() < 0.35) {
                this.activeFires.push({ pos: freighterTarget.clone().add(V((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 30)), life: 18, spreadCd: 3.0 });
              }
            }
          }
        },
        !isPlayerShip && this.fleetBattle,
      );
    }

    // Step Battleship shells, torpedoes & homing missiles
    this.bsFireCd = Math.max(0, this.bsFireCd - dt);
    this.bsTorpCd = Math.max(0, this.bsTorpCd - dt);
    this.bsMissileCd = Math.max(0, this.bsMissileCd - dt);
    for (let i = this.navalProjectiles.length - 1; i >= 0; i--) {
      const proj = this.navalProjectiles[i];
      proj.life -= dt;
      if (proj.kind === "shell") {
        proj.vel.y -= 9.8 * dt;
      } else if (proj.kind === "missile") {
        // Arc and home toward Freighter (or nearest enemy Battleship)
        const target = freighterTarget.clone();
        const toT = target.sub(proj.pos).normalize();
        proj.vel.lerp(toT.multiplyScalar(55), Math.min(1, dt * 3.5));
        this.pn.emit(proj.pos.x, proj.pos.y, proj.pos.z, 0, 0.5, 0, 1.2, 0.14, 0.4, 1.0, 0.7, 0.3, 0.6, 0, 0.25);
      } else {
        proj.pos.y = this.ocean.height(proj.pos.x, proj.pos.z, t) - 0.15;
        this.pn.emit(proj.pos.x, proj.pos.y + 0.25, proj.pos.z, 0, 1.2, 0, 1.0, 0.12, 0.4, 0.9, 0.95, 1.0, 0.5, 0, 0.3);
      }
      proj.pos.addScaledVector(proj.vel, dt);
      proj.mesh.position.copy(proj.pos);

      const localHit = this.ship.group.worldToLocal(proj.pos.clone());
      const hitFreighter = Math.abs(localHit.x) < 11.5 && Math.abs(localHit.z) < 66 && localHit.y > -7 && localHit.y < 10;
      const hitBs = this.battleships.find((bs, bi) => bi > 0 && !bs.sunk && proj.pos.distanceTo(bs.group.position) < 14);
      const hitWater = proj.kind === "shell" && proj.pos.y <= this.ocean.height(proj.pos.x, proj.pos.z, t);
      if (hitFreighter || hitBs || hitWater || proj.life <= 0) {
        if (hitFreighter) {
          this.explode(localHit, proj.kind === "torpedo" || proj.kind === "missile" ? 1.85 : 1.15, "tnt");
          this.say(
            proj.kind === "torpedo" ? "TORPEDO DIRECT HIT!" : proj.kind === "missile" ? "MISSILE DIRECT HIT!" : "CANNON SHELL IMPACT!",
            "alert",
          );
        } else if (hitBs) {
          damageBattleship(hitBs, proj.kind === "shell" ? 160 : 280);
          this.pn.emit(proj.pos.x, proj.pos.y + 1, proj.pos.z, 0, 8, 0, 5, 0.5, 0.9, 1, 0.5, 0.1, 0.8, -2, 1.0);
          this.audio.explosion(0.7);
        } else if (hitWater) {
          this.pn.emit(proj.pos.x, proj.pos.y + 0.5, proj.pos.z, 0, 10, 0, 4.5, 0.45, 0.9, 0.85, 0.95, 1.0, 0.7, -3.0, 1.2);
        }
        this.scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        this.navalProjectiles.splice(i, 1);
      }
    }

    // Engine room severe flooding (> 40%) triggers generator breakdown & explosion
    const engComp = this.ship.compartments[0];
    if (engComp && engComp.id === "engine" && engComp.fill > 0.4 && !this.engineExploded) {
      this.triggerEngineExplosion("severe flooding > 40%");
    }

    // Hydrostatic window burst under water immersion depth
    for (const pane of this.ship.glass) {
      if (!pane.broken) {
        const wp = this.worldPos(pane.pos, V());
        const oceanH = this.ocean.height(wp.x, wp.z, t);
        const head = oceanH - wp.y;
        const isBridge = pane.pos.y >= 5.0;
        if (shouldWindowBurst(head, isBridge)) {
          this.breakGlass(pane);
          this.say("WINDOW BURST under water pressure!", "alert");
          const comp = this.ship.compartments.find(
            (c) =>
              pane.pos.z >= c.min.z - 2.5 &&
              pane.pos.z <= c.max.z + 2.5 &&
              pane.pos.y >= c.min.y - 1 &&
              pane.pos.y <= c.max.y + 4,
          );
          if (comp) {
            const holeArea = Math.min(1.5, pane.w * pane.h * 0.7);
            const hole = {
              pos: pane.pos.clone(),
              area: holeArea,
              side: Math.sign(pane.pos.x) || 1,
              nx: -(Math.sign(pane.pos.x) || 1),
              ny: 0,
              nz: 0,
            };
            comp.holes.push(hole);
            this.makeHoleVisual(hole);
            this.sim.firstBreach = true;
          }
        }
      }
    }

    if (this.sim.firstBreach && !this.alarm && !this.sim.sunk) {
      this.alarm = true;
    }
    if (this.sim.sunk) this.alarm = false;
    this.noiseT = Math.max(0, this.noiseT - dt);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.6);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 1.8);

    const p = this.player;
    const b = p.body;
    const controls = !this.dead && !this.escapeState && !this.ended && !this.helmMode && !this.tabletOpen && this.activeVessel !== "battleship" && !this.orbitalLaserMode;

    let ev: { step: boolean; jumped: boolean; landed: number } = { step: false, jumped: false, landed: 0 };
    if (this.orbitalLaserMode) {
      if (!this.tabletOpen && !this.paused && !this.ended) {
        const [lx, ly] = inp.consumeLook();
        const panScale = (this.orbitalZoomFov / 60) * 0.45;
        this.orbitalAimX = Math.max(-220, Math.min(220, this.orbitalAimX + lx * panScale));
        this.orbitalAimZ = Math.max(-220, Math.min(220, this.orbitalAimZ + ly * panScale));
        const panSpd = (this.orbitalZoomFov / 60) * 70 * dt;
        if (inp.keys.has("KeyA") || inp.keys.has("ArrowLeft")) this.orbitalAimX -= panSpd;
        if (inp.keys.has("KeyD") || inp.keys.has("ArrowRight")) this.orbitalAimX += panSpd;
        if (inp.keys.has("KeyW") || inp.keys.has("ArrowUp")) this.orbitalAimZ -= panSpd;
        if (inp.keys.has("KeyS") || inp.keys.has("ArrowDown")) this.orbitalAimZ += panSpd;
        if (inp.keys.has("Equal") || inp.keys.has("NumpadAdd") || inp.keys.has("KeyQ")) {
          this.orbitalZoomFov = Math.max(8, this.orbitalZoomFov - 42 * dt);
        }
        if (inp.keys.has("Minus") || inp.keys.has("NumpadSubtract") || inp.keys.has("KeyZ")) {
          this.orbitalZoomFov = Math.min(72, this.orbitalZoomFov + 42 * dt);
        }
        if (inp.pressed("prev")) this.orbitalZoomFov = Math.max(8, this.orbitalZoomFov - 7);
        if (inp.pressed("next")) this.orbitalZoomFov = Math.min(72, this.orbitalZoomFov + 7);
        if (inp.fire) this.fireOrbitalDeathRay();
        if (inp.pressed("interact")) this.toggleOrbitalLaser(false);
      }
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.onGround = true;
    } else if (this.activeVessel === "battleship" && this.battleships[0]) {
      const bs = this.battleships[0];
      if (!this.tabletOpen && !this.paused && !this.ended) {
        const [lx, ly] = inp.consumeLook();
        const sens = 0.0022 * st.sens;
        p.yaw -= lx * sens;
        p.pitch = Math.max(-0.55, Math.min(0.65, p.pitch - ly * sens * (st.invertY ? -1 : 1)));
        // WASD Battleship driving
        if (inp.keys.has("KeyW") || inp.keys.has("ArrowUp")) bs.targetSpeed = Math.min(16, bs.targetSpeed + 10 * dt);
        else if (inp.keys.has("KeyS") || inp.keys.has("ArrowDown")) bs.targetSpeed = Math.max(-8, bs.targetSpeed - 10 * dt);
        if (inp.keys.has("KeyA") || inp.keys.has("ArrowLeft")) bs.rudderDeg = Math.max(-MAX_RUDDER_DEG, bs.rudderDeg - 35 * dt);
        else if (inp.keys.has("KeyD") || inp.keys.has("ArrowRight")) bs.rudderDeg = Math.min(MAX_RUDDER_DEG, bs.rudderDeg + 35 * dt);
        else bs.rudderDeg += (0 - bs.rudderDeg) * Math.min(1, dt * 1.5);
        // Fire main cannons (LMB), Torpedo (RMB / Q), Missile (E / F)
        if (inp.fire) this.fireBattleshipCannon();
        if (inp.pressed("alt") || inp.pressed("last")) this.fireBattleshipTorpedo();
        if (inp.pressed("interact") || inp.pressed("flash")) this.fireBattleshipMissile();
      }
      // Keep FPS body safely parked on Freighter deck (never falling into void)
      b.x = 9.8;
      b.y = DECK_Y;
      b.z = -42;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.onGround = true;
    } else {
      // Spieler
      ev = p.update(
        dt,
        inp,
        { world: this.ship.world, slide: this.sim.tiltDeg > 6 ? this.sim.slideVector() : [0, 0], water: this.waterAt, sens: st.sens, touchSens: st.touchSens, invertY: st.invertY, noclip: this.supervisor.isNoclip() },
        controls,
      );
      // Walkable Battleship decks when walking in FPS mode
      if (!this.supervisor.isNoclip()) {
        const wx = b.x + this.ship.group.position.x;
        const wz = b.z + this.ship.group.position.z;
        for (const bs of this.battleships) {
          if (Math.abs(wx - bs.baseX) <= bs.deckBounds.maxX + 0.5 && Math.abs(wz - bs.baseZ) <= bs.deckBounds.maxZ + 0.5) {
            const deckY = bs.group.position.y + bs.deckBounds.deckY;
            if (b.y < deckY) {
              b.y = deckY;
              b.vy = 0;
              b.onGround = true;
            }
          }
        }
      }
    }
    if (this.helmMode) this.handleHelm(dt);
    this.lastLookDX = 0;
    if (ev.step) {
      const inB = this.indoor > 0.5;
      this.audio.step(p.swimming || p.wading ? "wet" : inB ? "carpet" : "metal", p.sprinting ? 1.2 : p.crouch > 0.5 ? 0.5 : 0.9);
    }
    if (ev.jumped) this.audio.step("metal", 0.6);
    if (ev.landed < -4) {
      this.audio.step("metal", 1.4);
      if (ev.landed < -13) this.damagePlayer((-ev.landed - 13) * 9, "fall from a great height");
    }
    // Sicherheitsnetz: Orbital Space Station vs Maritime Ship
    if (this.theatre === "orbital") {
      if (!this.supervisor.isNoclip() && (b.y < STATION_BASE_Y - 12 || Math.abs(b.x) > 40 || Math.abs(b.z) > 85 || !isFinite(b.x + b.y + b.z))) {
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
        b.onGround = true;
        p.teleport(0, STATION_BASE_Y + 0.35, 0, 0);
        this.say("Returned to Space Station Airlock.", "info");
      }
    } else {
      // Sicherheitsnetz: aus der Welt gefallen
      if (b.y < -25 || !isFinite(b.x + b.y + b.z)) {
        this.damagePlayer(1000, "fell out of the world");
      }
      // Sicherheitsnetz: Schiff verlassen (außer wenn auf einem begehbaren Battleship-Deck)
      const onAnyBsDeck = this.battleships.some((bs) => {
        const wx = b.x + this.ship.group.position.x;
        const wz = b.z + this.ship.group.position.z;
        return Math.abs(wx - bs.baseX) <= bs.deckBounds.maxX + 1 && Math.abs(wz - bs.baseZ) <= bs.deckBounds.maxZ + 1;
      });
      if (controls && !this.supervisor.isNoclip() && !onAnyBsDeck && (Math.abs(b.x) > 13.5 || b.z < -72 || b.z > 72 || b.y > 25)) {
        p.teleport(9.8, DECK_Y, -42, Math.PI);
        this.say("Placed back on deck.", "warn");
      }
    }
    // Sauerstoff
    if (p.submerged && p.alive) {
      const drain = this.supervisor.filterOxygenDrain(dt / 30);
      p.oxygen -= drain;
      if (p.oxygen <= 0) {
        p.oxygen = 0;
        this.damagePlayer(14 * dt, "Ertrunken", true);
      }
      if (Math.random() < dt * 3) this.audio.gurgle();
    } else p.oxygen = Math.min(1, p.oxygen + dt * 0.7);
    if (p.wading && !this.escapeState) {
      // Kälteschock leicht
    }

    // In Sandbox Mode or God Mode: Health and armor continuously auto-regenerate
    if ((this.mode === "sandbox" || this.supervisor.isGodMode()) && p.alive) {
      p.health = Math.min(100, p.health + 35 * dt);
      p.armor = Math.min(100, p.armor + 35 * dt);
    }

    // Innenraum-Faktor
    const el = this.eyeLocal();
    let inside = false;
    for (const z of this.ship.zones) {
      if (z.containsPoint(el)) {
        inside = true;
        break;
      }
    }
    this.indoor += ((inside ? 1 : 0) - this.indoor) * Math.min(1, dt * 3);

    // Always allow [TAB] Tablet & [V] Ship Switch even in Battleship mode or with Tablet open
    if (inp.pressed("status")) this.toggleTablet();
    if (inp.pressed("switchShip")) this.switchVessel();

    if (controls) this.handleInput(dt);
    this.updateInteraction(dt);

    // Türen
    const bodies: { x: number; y: number; z: number; r: number; h: number }[] = [b];
    for (const g of this.guards) if (!g.dead) bodies.push({ x: g.body.x, y: g.body.y, z: g.body.z, r: g.body.r, h: g.body.h });
    for (const cv of this.crewVisuals) {
      cv.update(dt, (sparkPos) => {
        const wp = this.worldPos(sparkPos, V());
        this.pa.emit(
          wp.x,
          wp.y,
          wp.z,
          (Math.random() - 0.5) * 2.5,
          Math.random() * 2.0,
          (Math.random() - 0.5) * 2.5,
          0.25,
          0.04,
          0.015,
          1,
          0.85,
          0.4,
          1,
          8,
          0.3,
        );
      });
      bodies.push({ x: cv.member.x, y: cv.member.y, z: cv.member.z, r: 0.32, h: 1.75 });
    }
    for (const d of this.ship.doors) d.update(dt, bodies);

    this.updateGuards(dt);
    this.updateDyns(dt);
    this.updateBarrels(dt);
    this.updateWorldFx(dt);
    this.updateMission();
    this.updateEscape(dt);
    this.updateEffects(dt);

    // Animierte Teile
    for (const a of this.ship.animated) a(t, dt);
    this.updatePickups();

    // Tod
    if (this.dead) {
      this.deadT += dt;
      if (this.deadT > 2.2 && !this.ended) {
        this.ended = true;
        this.audio.lose();
        this.cb.onEnd({ kind: this.deathCause === "Ertrunken" ? "drown" : "dead", cause: this.deathCause, time: this.time, kills: this.kills, flood: this.sim.F, mode: this.mode });
      }
    }

    // Partikel
    this.pn.update(dt);
    this.pa.update(dt);

    // Kamera, Licht, Audio
    this.updateCamera(dt);
    this.updateLights(dt);
    this.updateAudio(dt);

    // HUD
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.09;
      this.pushHud();
    }
  }

  deathCause = "";

  // ------------------------------------------------------------------ Eingaben / Waffen
  private handleInput(dt: number) {
    const inp = this.input;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 1.5);
    // Waffenwechsel
    const order: WeaponId[] = ["pistol", "shotgun", "rifle", "tnt"];
    const sel = (id: WeaponId) => {
      if (!this.owned[id] || id === this.cur) return;
      this.last = this.cur;
      this.cur = id;
      this.vm.select(id);
      this.reloading = false;
      this.audio.reload("pump");
    };
    if (inp.pressed("w1")) sel("pistol");
    if (inp.pressed("w2")) sel("shotgun");
    if (inp.pressed("w3")) sel("rifle");
    if (inp.pressed("w4")) sel("tnt");
    if (inp.pressed("last")) sel(this.last);
    const cycle = (dir: number) => {
      let i = order.indexOf(this.cur);
      for (let k = 0; k < 4; k++) {
        i = (i + dir + 4) % 4;
        if (this.owned[order[i]]) {
          sel(order[i]);
          return;
        }
      }
    };
    if (inp.pressed("next")) cycle(1);
    if (inp.pressed("prev")) cycle(-1);
    if (inp.pressed("flash")) {
      this.flashOn = !this.flashOn;
      this.audio.click();
    }
    const isHoldingTNT = this.cur === "tnt" || this.dyns.length > 0;

    if (inp.pressed("detonate")) this.detonateAll();

    // God Mode logic:
    // When holding TNT, KeyG exclusively detonates TNT (never toggles God Mode).
    // Once God Mode is ON, disabling it requires holding KeyG continuously for 1.5s.
    if (!isHoldingTNT) {
      if (!this.supervisor.isGodMode()) {
        if (inp.pressed("godmode")) {
          this.supervisor.toggleGodMode();
          this.godModeHoldProgress = 0;
          this.player.health = 100;
          this.player.armor = 100;
          this.player.alive = true;
          this.dead = false;
          this.say("GOD MODE: ON (Immortal, infinite oxygen)", "good");
        }
      } else {
        inp.pressed("godmode"); // consume single tap
        if (inp.keys.has("KeyG")) {
          this.godModeHoldProgress = Math.min(1.0, this.godModeHoldProgress + dt / 1.5);
          if (this.godModeHoldProgress >= 0.999) {
            this.supervisor.toggleGodMode();
            this.godModeHoldProgress = 0;
            this.say("GOD MODE: OFF", "warn");
          }
        } else {
          this.godModeHoldProgress = Math.max(0, this.godModeHoldProgress - dt * 3.0);
        }
      }
    } else {
      inp.pressed("godmode");
      this.godModeHoldProgress = 0;
    }

    if (inp.pressed("status")) {
      this.toggleTablet();
    }
    if (inp.pressed("switchShip")) {
      this.switchVessel();
    }
    if (inp.pressed("terminal")) {
      this.terminalPinned = !this.terminalPinned;
      this.audio.click();
    }
    if (inp.pressed("lockdown")) {
      const closed = this.supervisor.lockdownBulkheads();
      this.alarm = true;
      this.say(`MASTER LOCKDOWN: ${closed} watertight bulkheads sealed!`, "alert");
    }
    if (inp.pressed("noclip")) {
      const noclip = this.supervisor.toggleNoclip();
      this.say(noclip ? "NOCLIP: ON (Free flight navigation)" : "NOCLIP: OFF", noclip ? "good" : "warn");
    }
    if (inp.pressed("floodDial")) {
      const rate = this.supervisor.cycleFloodRate();
      this.say(`FLOOD RATE: ${rate}x (${rate === 0 ? "Frozen" : rate === 3 ? "Catastrophic" : "Standard"})`, "info");
    }

    // Nachladen
    if (inp.pressed("reload")) this.startReload();
    if (this.reloading) {
      this.reloadT -= dt;
      const w = WEAPONS[this.cur];
      if (this.reloadT <= 0) {
        if (this.cur === "shotgun") {
          const a = this.ammo.shotgun;
          if (a.res > 0 && a.mag < w.mag) {
            a.mag++;
            a.res--;
            this.audio.reload("shell");
            if (a.mag < w.mag && a.res > 0) {
              this.reloadT = w.reload;
              this.vm.startReload(w.reload);
            } else {
              this.reloading = false;
              this.audio.reload("pump");
            }
          } else this.reloading = false;
        } else if (this.cur === "pistol" || this.cur === "rifle") {
          const a = this.ammo[this.cur];
          const need = w.mag - a.mag;
          const take = Math.min(need, a.res);
          a.mag += take;
          a.res -= take;
          this.reloading = false;
        }
      }
    }
    // Schießen & TNT
    const wantFire = inp.fire;
    if (this.cur === "tnt") {
      if (inp.pressed("alt")) this.placeTnt();
      if (wantFire && this.cooldown <= 0) {
        if (!this.isTouch() && !this.lockOk) this.requestLock();
        this.throwTnt();
      }
    } else {
      const w = WEAPONS[this.cur];
      inp.pressed("alt");
      if (wantFire) {
        if (!this.isTouch() && !this.lockOk) this.requestLock();
        if (w.auto || !this.fireHeld) this.tryFire();
        this.fireHeld = true;
      } else this.fireHeld = false;
    }
  }

  toggleTablet(force?: boolean) {
    this.tabletOpen = force ?? !this.tabletOpen;
    this.audio.click();
    if (this.tabletOpen) {
      if (document.pointerLockElement) {
        try {
          document.exitPointerLock();
        } catch {
          /* ignore */
        }
      }
    } else if (!this.paused && !this.isTouch()) {
      this.requestLock();
    }
  }

  switchVessel() {
    if (this.theatre === "orbital") {
      this.say("Return to Ocean first to command ships.", "warn");
      return;
    }
    if (!this.battleships.length) {
      this.spawnExtraBattleship();
    }
    const bs = this.battleships[0];
    if (this.activeVessel === "freighter") {
      this.activeVessel = "battleship";
      this.helmMode = false;
      this.say("Switched command to BATTLESHIP!", "good");
    } else {
      this.activeVessel = "freighter";
      this.helmMode = false;
      this.ship.group.visible = true;
      this.player.body.vx = 0;
      this.player.body.vy = 0;
      this.player.body.vz = 0;
      this.player.body.onGround = true;
      this.player.teleport(9.8, DECK_Y + 0.5, -42, Math.PI);
      this.say("Switched command to FREIGHTER NORDWIND!", "good");
    }
    this.audio.click();
    if (this.tabletOpen) {
      this.toggleTablet(false);
    } else if (!this.paused && !this.isTouch()) {
      this.requestLock();
    }
  }

  remoteTelegraph(dir: 1 | -1) {
    if (this.activeVessel === "battleship" && this.battleships[0]) {
      const bs = this.battleships[0];
      bs.targetSpeed = Math.max(-6, Math.min(14, bs.targetSpeed + dir * 4));
      this.say(`Battleship Target Speed: ${bs.targetSpeed.toFixed(0)} m/s`, "good");
    } else {
      const helm = this.supervisor.helm;
      helm.telegraph = stepTelegraph(helm.telegraph, dir);
      this.say(`Freighter Telegraph: ${helm.telegraph.toUpperCase()} (${TELEGRAPH_SPEED[helm.telegraph]} m/s)`, "good");
    }
    this.audio.click();
  }

  remoteRudder(deg: number) {
    if (this.activeVessel === "battleship" && this.battleships[0]) {
      this.battleships[0].rudderDeg = Math.max(-MAX_RUDDER_DEG, Math.min(MAX_RUDDER_DEG, deg));
      this.say(`Battleship Rudder: ${this.battleships[0].rudderDeg.toFixed(0)}°`, "info");
    } else {
      this.supervisor.helm.rudderCmd = Math.max(-MAX_RUDDER_DEG, Math.min(MAX_RUDDER_DEG, deg));
      this.say(`Freighter Rudder: ${this.supervisor.helm.rudderCmd.toFixed(0)}°`, "info");
    }
    this.audio.click();
  }

  fireBattleshipCannon() {
    const bs = this.battleships[0];
    if (!bs || bs.sunk) return;
    const noCooldown = this.supervisor.isGodMode() || this.mode === "sandbox";
    if (!noCooldown && this.bsFireCd > 0) return;
    this.bsFireCd = noCooldown ? 0 : 1.25;
    const aimDir = V(-Math.sin(this.player.yaw) * Math.cos(this.player.pitch), Math.sin(this.player.pitch), -Math.cos(this.player.yaw) * Math.cos(this.player.pitch)).normalize();
    const target = bs.group.position.clone().addScaledVector(aimDir, 120);
    fireBattleshipSalvo(bs, target, (muzzle, dir) => {
      const shellDir = dir.clone().add(V(0, 0.06, 0)).normalize();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa22 }),
      );
      mesh.position.copy(muzzle);
      this.scene.add(mesh);
      this.navalProjectiles.push({ mesh, pos: muzzle.clone(), vel: shellDir.multiplyScalar(115), kind: "shell", life: 3.5 });
      this.tracer(muzzle, muzzle.clone().addScaledVector(dir, 55), 0xff8833);
      this.pn.emit(muzzle.x, muzzle.y, muzzle.z, dir.x * 4, 2, dir.z * 4, 2.0, 0.35, 0.8, 0.8, 0.7, 0.5, 0.8, -0.2, 0.4);
      this.audio.explosion(0.45);
    });
  }

  fireBattleshipTorpedo() {
    const bs = this.battleships[0];
    if (!bs || bs.sunk) return;
    const noCooldown = this.supervisor.isGodMode() || this.mode === "sandbox";
    if (!noCooldown && this.bsTorpCd > 0) return;
    this.bsTorpCd = noCooldown ? 0 : 3.5;
    const dir = V(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw)).normalize();
    const start = bs.group.position.clone().addScaledVector(dir, 14);
    start.y = this.ocean.height(start.x, start.z, this.time) - 0.15;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0xff3300, emissiveIntensity: 0.6 }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = -this.player.yaw;
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.navalProjectiles.push({ mesh, pos: start, vel: dir.multiplyScalar(28), kind: "torpedo", life: 8.0 });
    this.audio.shot("shotgun");
    this.say("TORPEDO LAUNCHED!", "info");
  }

  fireBattleshipMissile() {
    const bs = this.battleships[0];
    if (!bs || bs.sunk) return;
    const noCooldown = this.supervisor.isGodMode() || this.mode === "sandbox";
    if (!noCooldown && this.bsMissileCd > 0) return;
    this.bsMissileCd = noCooldown ? 0 : 2.5;
    const start = bs.group.position.clone().add(V(0, 6.5, 0));
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xff6600, emissiveIntensity: 0.9 }),
    );
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.navalProjectiles.push({ mesh, pos: start, vel: V(0, 26, 0), kind: "missile", life: 8.0 });
    this.audio.explosion(0.35);
    this.say("CRUISE MISSILE LAUNCHED!", "alert");
  }

  restoreFreighter() {
    for (const c of this.ship.compartments) {
      c.holes = [];
      c.water = 0;
      c.fill = 0;
      c.flow = 0;
    }
    this.sim.sunk = false;
    this.sim.forceSink = false;
    this.sim.sinkDepth = 0;
    this.sim.roll = 0;
    this.sim.pitch = 0;
    this.supervisor.keelFractured = false;
    this.supervisor.engineDestroyed = false;
    this.engineExploded = false;
    this.ship.group.visible = true;
    this.ship.group.position.y = 0;
    this.ship.group.rotation.set(0, this.supervisor.helm.heading, 0);
    this.alarm = false;
    this.audio.click();
    this.say("FREIGHTER RESTORED: Hull sealed, flooded water pumped!", "good");
  }

  spawnExtraBattleship() {
    if (this.battleships.length >= 6) {
      this.say("Max 6 Battleships active to prevent lag.", "warn");
      return;
    }
    const idx = this.battleships.length;
    const angle = idx * 1.3;
    const dist = 65 + idx * 25;
    const x = this.ship.group.position.x + Math.cos(angle) * dist;
    const z = this.ship.group.position.z + Math.sin(angle) * dist;
    const level = (idx % 5) + 1;
    const team: "blue" | "red" = idx % 2 === 0 ? "blue" : "red";
    const bs = createBattleship(`bs-${idx + 1}`, x, z, level, team);
    this.scene.add(bs.group);
    this.battleships.push(bs);
    this.audio.click();
    this.say(`Spawned Battleship #${idx + 1} [Lv.${level} · ${team.toUpperCase()} · ${bs.maxHp} HP]!`, "good");
  }

  toggleTheatre(target?: "maritime" | "orbital") {
    const next = target ?? (this.theatre === "maritime" ? "orbital" : "maritime");
    this.theatre = next;
    this.spaceStation.active = next === "orbital";
    this.spaceStation.root.visible = next === "orbital";
    this.activeVessel = "freighter";
    this.helmMode = false;
    this.orbitalLaserMode = false;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.player.body.vx = 0;
    this.player.body.vy = 0;
    this.player.body.vz = 0;
    this.player.body.onGround = true;
    this.ship.group.visible = true;
    this.ocean.mesh.visible = true;
    for (const bs of this.battleships) bs.group.visible = true;
    if (next === "orbital") {
      this.player.teleport(0, STATION_BASE_Y + 0.35, 0, 0);
      this.say("🛰️ HYPERION-9 Orbital Space Station: Ships visible below — visit Command Center for Orbital Death Ray!", "good");
    } else {
      this.player.teleport(9.8, DECK_Y + 0.3, -42, Math.PI);
      this.say("⚓ Returned to Maritime Ocean Theatre.", "info");
    }
    this.audio.click();
    if (this.tabletOpen) this.toggleTablet(false);
    else if (!this.paused && !this.isTouch()) this.requestLock();
  }

  toggleOrbitalLaser(force?: boolean) {
    if (this.theatre !== "orbital") return;
    const next = force ?? !this.orbitalLaserMode;
    this.orbitalLaserMode = next;
    if (next) {
      this.orbitalAimX = this.ship.group.position.x;
      this.orbitalAimZ = this.ship.group.position.z;
      this.orbitalZoomFov = 55;
      this.say("☄️ ORBITAL DEATH RAY ONLINE: Aim [Mouse/WASD] · Zoom [Q/Z or +/-] · Fire [LMB] · Exit [E]", "alert");
    } else {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
      this.say("Exited Orbital Death Ray targeting.", "info");
    }
    this.audio.click();
    if (this.tabletOpen) this.toggleTablet(false);
    else if (!this.paused && !this.isTouch()) this.requestLock();
  }

  private shatterIntoPieces(center: THREE.Vector3, baseColor: number, count: number) {
    const geo = new THREE.BoxGeometry(1.1, 0.75, 1.4);
    const mat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.6, metalness: 0.45 });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      const sx = 0.5 + Math.random() * 1.9;
      const sy = 0.4 + Math.random() * 1.3;
      const sz = 0.6 + Math.random() * 2.2;
      m.scale.set(sx, sy, sz);
      m.position.set(
        center.x + (Math.random() - 0.5) * 26,
        Math.max(0.5, center.y + Math.random() * 7),
        center.z + (Math.random() - 0.5) * 75,
      );
      const vel = V((Math.random() - 0.5) * 34, 14 + Math.random() * 28, (Math.random() - 0.5) * 34);
      const rot = V((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
      this.scene.add(m);
      this.debris.push({ m, vel, rot, life: 9 + Math.random() * 5 });
    }
  }

  fireOrbitalDeathRay() {
    if (this.laserCd > 0) return;
    this.laserCd = 1.4;
    const tx = this.orbitalAimX;
    const tz = this.orbitalAimZ;
    const beamGeo = new THREE.CylinderGeometry(2.6, 4.4, STATION_BASE_Y + 20, 14);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(tx, (STATION_BASE_Y - 10) * 0.5, tz);
    this.scene.add(beam);
    const coreGeo = new THREE.CylinderGeometry(1.1, 1.8, STATION_BASE_Y + 20, 10);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(beam.position);
    this.scene.add(core);
    setTimeout(() => {
      this.scene.remove(beam);
      this.scene.remove(core);
      beamGeo.dispose();
      beamMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
    }, 380);

    this.audio.explosion(2.2, 14);
    this.shake = Math.max(this.shake, 1.4);
    const hitPos = V(tx, 1.5, tz);
    // Massive Orbital Fireball, Plasma Plume & Expanding Shockwave Ring
    const ringGeo = new THREE.RingGeometry(2, 5.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(tx, 1.2, tz);
    this.scene.add(ring);
    let rScale = 1;
    const ringInt = setInterval(() => {
      rScale += 1.6;
      ring.scale.set(rScale, 1, rScale);
      ringMat.opacity = Math.max(0, ringMat.opacity - 0.08);
      if (ringMat.opacity <= 0) {
        clearInterval(ringInt);
        this.scene.remove(ring);
        ringGeo.dispose();
        ringMat.dispose();
      }
    }, 30);

    for (let i = 0; i < 36; i++) {
      this.pa.emit(
        tx + (Math.random() - 0.5) * 14,
        1.5 + Math.random() * 4,
        tz + (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 26,
        8 + Math.random() * 24,
        (Math.random() - 0.5) * 26,
        4.5 + Math.random() * 4,
        0.7,
        1.8,
        1.0,
        0.52,
        0.1,
        0.95,
        -1.5,
        1.2,
      );
      this.pn.emit(
        tx + (Math.random() - 0.5) * 16,
        2 + Math.random() * 6,
        tz + (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 18,
        12 + Math.random() * 22,
        (Math.random() - 0.5) * 18,
        6 + Math.random() * 5,
        0.5,
        2.6,
        0.15,
        0.15,
        0.18,
        0.85,
        -2,
        1.4,
      );
    }
    if (this.activeFires.length < 18) {
      this.activeFires.push({ pos: hitPos.clone(), life: 25, spreadCd: 2.0 });
    }

    // Check Freighter hit -> shatter into 340 pieces & trigger sinking!
    const shipDist = Math.hypot(tx - this.ship.group.position.x, tz - this.ship.group.position.z);
    if (shipDist < 75 && this.ship.group.visible) {
      this.shatterIntoPieces(this.ship.group.position.clone().add(V(0, 4, 0)), 0x475569, 340);
      this.ship.group.visible = false;
      this.sim.sunk = true;
      for (const c of this.ship.compartments) c.fill = 1;
      this.say("☄️ ORBITAL DEATH RAY OBLITERATED FREIGHTER NORDWIND!", "alert");
    }

    // Check Battleships -> shatter into 240 pieces!
    for (const bs of this.battleships) {
      if (!bs.group.visible) continue;
      const d = Math.hypot(tx - bs.baseX, tz - bs.baseZ);
      if (d < 55) {
        this.shatterIntoPieces(bs.group.position.clone().add(V(0, 3, 0)), 0x64748b, 240);
        bs.group.visible = false;
        bs.sunk = true;
        bs.hp = 0;
        this.say("☄️ ORBITAL DEATH RAY SHATTERED BATTLESHIP!", "alert");
      }
    }
  }

  toggleFleetBattle() {
    if (this.battleships.length < 2) {
      this.spawnExtraBattleship();
    }
    this.fleetBattle = !this.fleetBattle;
    this.audio.click();
    this.say(this.fleetBattle ? "FLEET BATTLE STARTED: Battleships engaging!" : "FLEET BATTLE PAUSED", this.fleetBattle ? "alert" : "info");
  }

  remoteFireSalvo() {
    this.bsFireCd = 0;
    this.fireBattleshipCannon();
    this.say("BATTLESHIP SALVO FIRED!", "alert");
  }

  remoteLockdown() {
    const closed = this.supervisor.lockdownBulkheads();
    this.alarm = true;
    this.say(`MASTER LOCKDOWN: ${closed} watertight bulkheads sealed!`, "alert");
  }

  remoteToggleGodMode() {
    const on = this.supervisor.toggleGodMode();
    if (on) {
      this.player.health = 100;
      this.player.armor = 100;
      this.player.alive = true;
      this.dead = false;
    }
    this.say(on ? "GOD MODE: ON" : "GOD MODE: OFF", on ? "good" : "warn");
  }

  remoteToggleNoclip() {
    const on = this.supervisor.toggleNoclip();
    this.say(on ? "NOCLIP: ON" : "NOCLIP: OFF", on ? "good" : "warn");
  }

  remoteCycleFlood() {
    const rate = this.supervisor.cycleFloodRate();
    this.say(`FLOOD RATE: ${rate}x`, "info");
  }

  private handleHelm(dt: number) {
    if (!this.helmMode) return;
    const inp = this.input;
    const helm = this.supervisor.helm;
    this.helmThrottleCooldown = Math.max(0, this.helmThrottleCooldown - dt);

    if (inp.pressed("interact")) {
      this.helmMode = false;
      this.say("Exited Helm Mode – walking freely", "info");
      this.audio.click();
      return;
    }

    if (this.helmThrottleCooldown <= 0) {
      if (inp.keys.has("KeyW") || inp.keys.has("ArrowUp")) {
        helm.telegraph = stepTelegraph(helm.telegraph, 1);
        this.helmThrottleCooldown = 0.35;
        this.audio.click();
        this.say(`Engine Telegraph: ${helm.telegraph.toUpperCase()} (Target: ${TELEGRAPH_SPEED[helm.telegraph]} m/s)`, "good");
      } else if (inp.keys.has("KeyS") || inp.keys.has("ArrowDown")) {
        helm.telegraph = stepTelegraph(helm.telegraph, -1);
        this.helmThrottleCooldown = 0.35;
        this.audio.click();
        this.say(`Engine Telegraph: ${helm.telegraph.toUpperCase()} (Target: ${TELEGRAPH_SPEED[helm.telegraph]} m/s)`, "warn");
      }
    }

    if (inp.keys.has("KeyA") || inp.keys.has("ArrowLeft")) {
      helm.rudderCmd = Math.max(-MAX_RUDDER_DEG, helm.rudderCmd - 28 * dt);
    } else if (inp.keys.has("KeyD") || inp.keys.has("ArrowRight")) {
      helm.rudderCmd = Math.min(MAX_RUDDER_DEG, helm.rudderCmd + 28 * dt);
    } else {
      helm.rudderCmd += (0 - helm.rudderCmd) * Math.min(1, dt * 1.2);
    }
  }
  private fireHeld = false;

  private startReload() {
    if (this.reloading || this.cur === "tnt") return;
    const w = WEAPONS[this.cur];
    const a = this.ammo[this.cur];
    if (a.mag >= w.mag || a.res <= 0) return;
    this.reloading = true;
    if (this.cur === "shotgun") {
      this.reloadT = w.reload * 0.8;
      this.vm.startReload(w.reload);
    } else {
      this.reloadT = w.reload;
      this.vm.startReload(w.reload);
      this.audio.reload("mag");
    }
  }

  private tryFire() {
    if (this.cur === "tnt" || this.cooldown > 0) return;
    const w = WEAPONS[this.cur];
    const a = this.ammo[this.cur];
    if (this.reloading) {
      if (this.cur === "shotgun" && a.mag > 0) {
        this.reloading = false;
        this.vm.cancelReload();
      } else return;
    }
    const isInfiniteAmmo = this.mode === "sandbox" || this.supervisor.isGodMode();
    if (!isInfiniteAmmo && a.mag <= 0) {
      this.audio.empty();
      this.cooldown = 0.3;
      if (a.res > 0) this.startReload();
      return;
    }
    if (!isInfiniteAmmo) {
      a.mag--;
    } else {
      a.mag = w.mag;
      a.res = 999;
    }
    this.cooldown = 60 / w.rpm;
    console.log(`[NORDWIND/WEAPON] Fired ${this.cur}. Ammo: ${a.mag}/${w.mag} (res: ${a.res}), Infinite: ${isInfiniteAmmo}`);
    this.vm.fireKick(w.recoil);
    this.audio.shot(this.cur as "pistol" | "shotgun" | "rifle");
    this.player.pitch += 0.006 * w.recoil + Math.random() * 0.003;
    this.player.yaw += (Math.random() - 0.5) * 0.004 * w.recoil;
    this.shake = Math.min(1, this.shake + 0.08 * w.recoil);
    this.noiseT = 0.4;
    this.noiseRange = 1;
    this.noisePos.copy(this.eyeLocal());
    this.muzzleLight.intensity = 25;
    this.bloom = Math.min(1, this.bloom + 0.12);
    const origin = this.eyeLocal();
    const dir0 = this.lookDirLocal();
    const right = V(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    const up = V().crossVectors(right, dir0).normalize();
    const spread = w.spread * (this.cur === "rifle" ? 1 + this.bloom * 1.5 : 1) * (this.player.crouch > 0.5 ? 0.7 : 1) * (this.player.speed > 3 ? 1.5 : 1);
    for (let i = 0; i < w.pellets; i++) {
      const d = dir0.clone();
      const rr = Math.random() * spread,
        aa = Math.random() * Math.PI * 2;
      d.addScaledVector(right, Math.cos(aa) * rr).addScaledVector(up, Math.sin(aa) * rr).normalize();
      this.hitscan(origin, d, w.damage, w.range, i === 0);
    }
    if (a.mag <= 0 && a.res > 0) setTimeout(() => this.startReload(), 250);
  }

  private tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe9a0) {
    let tr = this.tracers.find((x) => x.t <= 0);
    if (!tr) {
      if (this.tracers.length > 14) return;
      const g = new THREE.BufferGeometry().setFromPoints([V(), V(0, 0, 1)]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.frustumCulled = false;
      this.scene.add(line);
      tr = { line, t: 0 };
      this.tracers.push(tr);
    }
    const pos = tr.line.geometry.attributes.position as THREE.BufferAttribute;
    const a = this.worldPos(from, V()),
      b = this.worldPos(to, V());
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    (tr.line.material as THREE.LineBasicMaterial).color.setHex(color);
    tr.line.visible = true;
    tr.t = 0.06;
  }

  hitscan(origin: THREE.Vector3, dir: THREE.Vector3, damage: number, range: number, primary: boolean) {
    const world = this.ship.world;
    const wall = world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range, (c) => c.tag !== "glassbroken");
    let bestT = wall ? wall.dist : range;
    let kind: "none" | "wall" | "guard" | "tnt" = wall ? "wall" : "none";
    let guard: Guard | null = null;
    let head = false;
    let dyn: Dyn | null = null;
    for (const g of this.guards) {
      if (g.dead) continue;
      const bd = g.body;
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bd.x - 0.33, bd.y, bd.z - 0.33, bd.x + 0.33, bd.y + 1.82, bd.z + 0.33);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = "guard";
        guard = g;
        head = origin.y + dir.y * t > bd.y + 1.45;
      }
    }
    for (const d of this.dyns) {
      const c = V(d.body.x, d.body.y + 0.15, d.body.z).sub(origin);
      const tc = c.dot(dir);
      if (tc > 0 && tc < bestT) {
        const dist2 = c.lengthSq() - tc * tc;
        if (dist2 < 0.09) {
          bestT = tc;
          kind = "tnt";
          dyn = d;
        }
      }
    }
    const hp = origin.clone().addScaledVector(dir, bestT);
    if (primary || kind !== "none") {
      const start = origin.clone().addScaledVector(dir, 0.8).add(V(0, -0.12, 0));
      if (this.cur !== "shotgun" || primary) this.tracer(start, hp);
    }
    const pa = this.posAudio(hp);
    if (kind === "guard" && guard) {
      const killed = guard.damage(damage, head, origin.x, origin.z);
      this.hitMarker = 1;
      this.audio.hit(head);
      for (let i = 0; i < 6; i++) this.pn.emit(...this.pw(hp), (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.5, 0.06, 0.2, 0.55, 0.03, 0.03, 0.8, 9, 1);
      if (killed) {
        this.kills++;
        this.say(head ? "Headshot!" : "Guard eliminated", "info");
      }
      this.alertGuards(origin, 1);
    } else if (kind === "tnt" && dyn) {
      this.explodeDyn(dyn);
    } else if (kind === "wall" && wall) {
      const n = V(wall.nx, wall.ny, wall.nz);
      const c = wall.collider;
      const tag = c.tag;
      if (tag === "barrel" && c.owner) {
        this.hitMarker = 0.6;
        const brl = c.owner as any;
        brl.hp -= damage;
        this.audio.bulletImpact(pa, true);
        this.sparks(hp, n, 5);
        if (brl.hp <= 0 && !brl.dead && brl.fuse <= 0) brl.fuse = 0.05;
      } else if (tag === "crate" && c.owner) {
        const cr = c.owner as any;
        cr.hp -= damage;
        this.audio.bulletImpact(pa, false);
        for (let i = 0; i < 4; i++) this.pn.emit(...this.pw(hp), (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.6, 0.05, 0.08, 0.5, 0.35, 0.2, 1, 8, 1);
        if (cr.hp <= 0) this.breakCrate(cr);
      } else if (tag === "glass" && c.owner) {
        this.breakGlass(c.owner);
        // Kugel fliegt durch das Fenster weiter
        const o2 = hp.clone().addScaledVector(dir, 0.15);
        this.hitscan(o2, dir, damage, range - bestT, false);
      } else {
        this.audio.bulletImpact(pa, tag !== "door" || true);
        this.sparks(hp, n, 5);
        this.bulletHole(hp, n);
      }
    } else if (kind === "none") {
      // Meer treffen -> Spritzer
      const w = this.worldPos(origin.clone().addScaledVector(dir, Math.min(range, 60)));
      if (w.y < 1 && dir.y < -0.02) {
        /* kein Treffer */
      }
    }
  }

  private pw(local: THREE.Vector3): [number, number, number] {
    const w = this.worldPos(local, this.tmpV);
    return [w.x, w.y, w.z];
  }

  private sparks(hp: THREE.Vector3, n: THREE.Vector3, count: number) {
    const w = this.worldPos(hp, V());
    const nw = n.clone().transformDirection(this.ship.group.matrixWorld);
    for (let i = 0; i < count; i++) {
      const v = nw.clone().multiplyScalar(2 + Math.random() * 3).add(V((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4));
      this.pa.emit(w.x, w.y, w.z, v.x, v.y, v.z, 0.3 + Math.random() * 0.3, 0.05, 0.02, 1, 0.8, 0.35, 1, 9, 0.5);
    }
    this.pn.emit(w.x, w.y, w.z, nw.x * 0.5, nw.y * 0.5 + 0.3, nw.z * 0.5, 0.7, 0.1, 0.35, 0.5, 0.5, 0.5, 0.3, -0.5, 1);
  }

  private bulletHole(hp: THREE.Vector3, n: THREE.Vector3) {
    const m = this.holes[this.holeIdx++ % this.holes.length];
    m.position.copy(hp).addScaledVector(n, 0.012);
    m.lookAt(hp.clone().add(n));
    m.visible = true;
  }

  alertGuards(from: THREE.Vector3, range: number) {
    for (const g of this.guards) if (!g.dead && g.eyePos.distanceTo(from) < 40 * range) g.alert(from.x, from.y, from.z);
  }

  breakGlass(pane: any) {
    if (pane.broken) return;
    pane.broken = true;
    pane.mesh.visible = false;
    pane.collider.enabled = false;
    pane.collider.tag = "glassbroken";
    this.audio.glass(this.posAudio(pane.pos));
    const w = this.worldPos(pane.pos, V());
    for (let i = 0; i < 26; i++) {
      const dx = (Math.random() - 0.5) * pane.w * (pane.axis === "x" ? 1 : 0),
        dz = (Math.random() - 0.5) * pane.w * (pane.axis === "z" ? 1 : 0),
        dy = (Math.random() - 0.5) * pane.h;
      this.pa.emit(w.x + dx, w.y + dy, w.z + dz, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 1 + Math.random(), 0.07, 0.05, 0.75, 0.9, 1, 0.9, 9, 0.2);
    }
  }

  breakCrate(c: any) {
    if (c.dead) return;
    c.dead = true;
    c.mesh.visible = false;
    this.ship.world.remove(c.collider);
    this.audio.bulletImpact(this.posAudio(c.pos), false);
    const w = this.worldPos(c.pos, V());
    for (let i = 0; i < 18; i++) this.pn.emit(w.x, w.y, w.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, 1.2, 0.08, 0.06, 0.45, 0.3, 0.15, 1, 9, 0.4);
    if (c.loot) {
      const t = c.loot;
      if (t === "ammo_pistol") {
        this.ammo.pistol.res += 24;
        this.say("Crate: +24 pistol ammo", "pickup");
      } else if (t === "ammo_shotgun") {
        this.ammo.shotgun.res += 8;
        this.say("Crate: +8 shotgun shells", "pickup");
      } else if (t === "ammo_rifle") {
        this.ammo.rifle.res += 30;
        this.say("Crate: +30 rifle ammo", "pickup");
      } else if (t === "medkit") {
        this.player.health = Math.min(100, this.player.health + 40);
        this.say("Crate: medkit (+40 HP)", "pickup");
      } else if (t === "tnt") {
        this.tnt += 2;
        this.say("Crate: +2 TNT", "pickup");
      }
      this.audio.pickup();
    }
  }

  // ------------------------------------------------------------------ TNT
  private makeTntMesh(): { g: THREE.Group; led: THREE.Mesh } {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), red);
      m.position.set((i - 1) * 0.09, 0, 0);
      m.rotation.x = Math.PI / 2;
      m.castShadow = true;
      g.add(m);
    }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    tape.position.y = 0.0;
    g.add(tape);
    const timer = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    timer.position.set(0, 0.07, 0);
    g.add(timer);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
    led.position.set(0.03, 0.105, 0);
    g.add(led);
    return { g, led };
  }

  private spawnDyn(pos: THREE.Vector3, vel: THREE.Vector3, fuse: number) {
    const { g, led } = this.makeTntMesh();
    g.position.copy(pos);
    this.ship.group.add(g);
    const d: Dyn = {
      mesh: g,
      body: { x: pos.x, y: pos.y - 0.1, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z, r: 0.14, h: 0.2, onGround: false, step: 0.05 },
      fuse,
      resting: false,
      beep: 0,
      spark: 0,
      led,
      placedMarker: false,
      remote: -1,
    };
    this.dyns.push(d);
    this.audio.fuseLit();
    return d;
  }

  private fuseTime() {
    return this.settings.difficulty === "easy" ? 8 : this.settings.difficulty === "hard" ? 5 : 6.5;
  }

  private throwTnt() {
    const isInfiniteTnt = this.mode === "sandbox" || this.supervisor.isGodMode();
    if (!isInfiniteTnt && this.tnt <= 0) {
      this.audio.empty();
      this.cooldown = 0.4;
      this.say("No TNT left!", "warn");
      return;
    }
    if (!isInfiniteTnt) {
      this.tnt--;
    } else {
      this.tnt = 99;
    }
    this.cooldown = 0.9;
    this.vm.throwT = 1;
    this.audio.throw();
    const dir = this.lookDirLocal();
    const o = this.eyeLocal().addScaledVector(dir, 0.5).add(V(0, -0.15, 0));
    const pb = this.player.body;
    const v = dir.clone().multiplyScalar(11).add(V(pb.vx * 0.6, 2.4, pb.vz * 0.6));
    this.spawnDyn(o, v, this.fuseTime());
    console.log(`[NORDWIND/TNT] Thrown charge. Remaining TNT: ${this.tnt}, Infinite: ${isInfiniteTnt}`);
    this.noiseT = 0.2;
    this.noisePos.copy(o);
    if (this.tnt === 0) this.say("Last TNT thrown.", "warn");
  }

  private placeTnt() {
    const isInfiniteTnt = this.mode === "sandbox" || this.supervisor.isGodMode();
    if (!isInfiniteTnt && this.tnt <= 0) {
      this.audio.empty();
      this.say("No TNT left!", "warn");
      return;
    }
    const dir = this.lookDirLocal();
    const e = this.eyeLocal();
    const fwd = V(dir.x, 0, dir.z).normalize();
    const o = e.clone().addScaledVector(fwd, 0.7);
    o.y = this.player.body.y + 0.35;
    // nicht in Wände legen
    const hit = this.ship.world.raycast(e.x, e.y - 0.5, e.z, fwd.x, 0, fwd.z, 0.8);
    if (hit) o.copy(e).addScaledVector(fwd, Math.max(0.2, hit.dist - 0.25)).setY(this.player.body.y + 0.35);
    if (!isInfiniteTnt) {
      this.tnt--;
    } else {
      this.tnt = 99;
    }
    this.cooldown = 0.6;
    this.vm.throwT = 0.6;
    this.audio.step("metal", 0.5);
    const d = this.spawnDyn(o, fwd.multiplyScalar(0.8).setY(0.2), this.fuseTime() + 4);
    console.log(`[NORDWIND/TNT] Placed charge at [${o.x.toFixed(2)}, ${o.y.toFixed(2)}, ${o.z.toFixed(2)}]. Total active charges: ${this.dyns.length}`);
    this.say("TNT placed. Detonate with G (remote) – or let the fuse burn down!", "info");
    return d;
  }

  private detonateAll() {
    if (this.cur !== "tnt" && this.dyns.length === 0) {
      this.say("No charge placed.", "warn");
      return;
    }
    if (this.dyns.length === 0) {
      this.say("No charge placed.", "warn");
      this.audio.empty();
      return;
    }
    this.audio.detonator();
    this.detonated = true;
    console.log(`[NORDWIND/TNT] Detonating all ${this.dyns.length} charges!`);
    let i = 0;
    for (const d of this.dyns) {
      d.remote = 0.25 + i * 0.22;
      i++;
    }
  }

  private explodeDyn(d: Dyn) {
    const idx = this.dyns.indexOf(d);
    if (idx < 0) return;
    this.dyns.splice(idx, 1);
    this.ship.group.remove(d.mesh);
    const p = V(d.body.x, d.body.y + 0.15, d.body.z);
    this.detonated = true;
    this.explode(p, 1.0, "tnt");
  }

  private updateDyns(dt: number) {
    const w = this.ship.world;
    for (const d of [...this.dyns]) {
      const b = d.body;
      if (d.remote >= 0) {
        d.remote -= dt;
        if (d.remote < 0) {
          this.explodeDyn(d);
          continue;
        }
      }
      b.vy -= 14 * dt;
      const sl = this.sim.tiltDeg > 6 ? this.sim.slideVector() : [0, 0];
      if (b.onGround) {
        b.vx *= Math.exp(-dt * 7);
        b.vz *= Math.exp(-dt * 7);
        b.vx += sl[0] * dt * 0.6;
        b.vz += sl[1] * dt * 0.6;
      }
      const vx0 = b.vx,
        vy0 = b.vy,
        vz0 = b.vz;
      const res = w.move(b, b.vx * dt, b.vy * dt, b.vz * dt);
      if (res.hitX) b.vx = -vx0 * 0.35;
      if (res.hitZ) b.vz = -vz0 * 0.35;
      if (res.hitY && vy0 < -1.5) {
        b.vy = -vy0 * 0.25;
        this.audio.step("metal", 0.6);
      }
      if (b.y < -30) {
        this.dyns.splice(this.dyns.indexOf(d), 1);
        this.ship.group.remove(d.mesh);
        continue;
      }
      d.mesh.position.set(b.x, b.y + 0.12, b.z);
      d.mesh.rotation.y += dt * (Math.abs(b.vx) + Math.abs(b.vz)) * 1.5;
      const spd = Math.hypot(b.vx, b.vz, b.vy);
      if (!d.resting && b.onGround && spd < 0.4) {
        d.resting = true;
        // Sprengpunkt scharf?
        for (const m of this.ship.markers) {
          if (m.armed) continue;
          const dist = Math.hypot(b.x - m.pos.x, b.z - m.pos.z, (b.y - m.pos.y) * 0.6);
          if (dist < m.radius) {
            m.armed = true;
            this.say(`Detonation point "${m.name}" is armed (${this.ship.markers.filter((q) => q.armed).length} / ${this.ship.markers.length})`, "good");
            this.audio.unlock();
          }
        }
      }
      // Zündschnur
      d.fuse -= dt;
      d.beep -= dt;
      const rate = d.fuse > 3 ? 0.8 : d.fuse > 1.5 ? 0.4 : 0.15;
      if (d.beep <= 0) {
        d.beep = rate;
        this.audio.beep(d.fuse < 1.5, this.posAudio(d.mesh.position));
        (d.led.material as THREE.MeshBasicMaterial).color.setHex(0xff2200);
        setTimeout(() => ((d.led.material as THREE.MeshBasicMaterial).color.setHex(0x330500)), 90);
      }
      d.spark -= dt;
      if (d.spark <= 0) {
        d.spark = 0.04;
        const wp = this.worldPos(V(b.x, b.y + 0.28, b.z), V());
        this.pa.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.35, 0.05, 0.01, 1, 0.7, 0.2, 1, 6, 0.5);
        this.pn.emit(wp.x, wp.y, wp.z, 0, 0.5, 0, 0.8, 0.05, 0.25, 0.6, 0.6, 0.6, 0.25, -0.3, 1);
      }
      if (d.fuse <= 0) this.explodeDyn(d);
    }
  }

  // ------------------------------------------------------------------ Explosionen
  explode(p: THREE.Vector3, power: number, src: string) {
    const R = (src === "tnt" ? 14 : 11) * power;
    const wp = this.worldPos(p, V());
    const pa = this.posAudio(p);
    this.audio.explosion(pa, Math.max(0.6, power));
    // Licht
    const fl = this.flashLights.find((l) => l.intensity < 30) || this.flashLights[0];
    fl.position.copy(wp);
    fl.intensity = 900 * power;
    fl.userData.decay = 1;
    // Partikel
    const dens = Math.max(0.2, this.settings.particles);
    const n = (k: number) => Math.round(k * dens * 1.4);
    for (let i = 0; i < n(60); i++) {
      const v = V((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).normalize().multiplyScalar((2 + Math.random() * 7) * power);
      this.pa.emit(wp.x, wp.y, wp.z, v.x, v.y, v.z, 0.5 + Math.random() * 0.7, 1.4 * power, 3.2 * power, 1, 0.5 + Math.random() * 0.3, 0.1, 0.9, -1, 1.5);
    }
    for (let i = 0; i < n(45); i++) {
      const v = V((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).multiplyScalar(3 * power);
      this.pn.emit(wp.x, wp.y, wp.z, v.x, v.y + 1, v.z, 3 + Math.random() * 3, 1.5 * power, 6 * power, 0.25, 0.25, 0.25, 0.6, -0.8, 0.6);
    }
    for (let i = 0; i < n(80); i++) {
      const v = V(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 16);
      this.pa.emit(wp.x, wp.y, wp.z, v.x, v.y, v.z, 0.6 + Math.random() * 1.0, 0.12, 0.03, 1, 0.8, 0.4, 1, 14, 0.2);
    }
    for (let i = 0; i < n(26); i++) {
      const v = V(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 10);
      this.pn.emit(wp.x, wp.y, wp.z, v.x, v.y, v.z, 1.4 + Math.random(), 0.16, 0.12, 0.2, 0.18, 0.15, 1, 14, 0.1);
    }
    // Druckwelle
    const sw = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    sw.position.copy(wp);
    this.scene.add(sw);
    let st = 0;
    this.effects.push({
      update: (dt) => {
        st += dt;
        const k = st / 0.45;
        sw.scale.setScalar(0.5 + k * R * 0.9);
        (sw.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0, 1 - k);
        return k < 1;
      },
      dispose: () => {
        this.scene.remove(sw);
        sw.geometry.dispose();
        (sw.material as THREE.Material).dispose();
      },
    });
    // Spritzer wenn nahe am Meer
    const seaH = this.ocean.height(wp.x, wp.z, this.time);
    if (wp.y < seaH + 4 && wp.y > seaH - 6) {
      for (let i = 0; i < n(40); i++) this.pn.emit(wp.x, seaH, wp.z, (Math.random() - 0.5) * 8, 6 + Math.random() * 10, (Math.random() - 0.5) * 8, 1.6, 0.5, 1.2, 0.9, 0.95, 1, 0.7, 16, 0.2);
    }
    // Brandfleck
    const down = this.ship.world.raycast(p.x, p.y + 0.3, p.z, 0, -1, 0, 3);
    if (down) {
      const m = this.scorch[this.scorchIdx++ % this.scorch.length];
      m.position.set(p.x, p.y + 0.3 - down.dist + 0.02, p.z);
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.scale.setScalar(1.2 * power + Math.random() * 0.5);
      m.visible = true;
    }
    // Schaden
    const pl = this.player.body;
    const pe = this.eyeLocal();
    const dp = Math.hypot(pe.x - p.x, pe.y - p.y, pe.z - p.z);
    this.shake = Math.min(1.6, this.shake + Math.max(0, 1 - dp / 45) * 1.4);
    if (dp < R && !this.dead) {
      const los = this.ship.world.lineClear(p.x, p.y, p.z, pe.x, pe.y, pe.z);
      const dmg = 140 * Math.pow(1 - dp / R, 1.3) * (los ? 1 : 0.3) * (this.settings.difficulty === "hard" ? 1.2 : this.settings.difficulty === "easy" ? 0.7 : 1);
      if (dmg > 1) {
        this.damagePlayer(dmg, src === "barrel" ? "Killed by an exploding barrel" : "Killed by an explosion");
        const kx = pl.x - p.x,
          kz = pl.z - p.z,
          kl = Math.hypot(kx, kz) + 0.1;
        pl.vx += (kx / kl) * 9 * (1 - dp / R);
        pl.vz += (kz / kl) * 9 * (1 - dp / R);
        pl.vy += 4 * (1 - dp / R);
      }
    }
    for (const g of this.guards) {
      if (g.dead) continue;
      const gp = g.eyePos;
      const d = gp.distanceTo(p);
      if (d < R) {
        const los = this.ship.world.lineClear(p.x, p.y, p.z, gp.x, gp.y, gp.z);
        const dmg = 160 * Math.pow(1 - d / R, 1.2) * (los ? 1 : 0.25);
        if (dmg > 1 && g.damage(dmg, false, p.x, p.z)) {
          this.kills++;
          this.say("Guard eliminated by explosion", "info");
        }
      }
    }
    // Fässer & Kisten & Glas
    for (const b of this.ship.barrels) {
      if (b.dead) continue;
      const d = b.pos.distanceTo(p);
      if (d < R * 0.75 && b.fuse <= 0) b.fuse = 0.12 + Math.random() * 0.35 + d * 0.02;
    }
    for (const c of this.ship.crates) if (!c.dead && c.pos.distanceTo(p) < R * 0.6) this.breakCrate(c);
    for (const g of this.ship.glass) if (!g.broken && g.pos.distanceTo(p) < R * 1.2) this.breakGlass(g);
    // TNT in der Nähe zündet mit
    for (const d of [...this.dyns]) {
      const dd = V(d.body.x, d.body.y, d.body.z).distanceTo(p);
      if (dd < R * 0.5 && d.remote < 0) d.remote = 0.1 + Math.random() * 0.2;
    }
    // Hüllenbruch
    const comp = this.compAt(p.x, p.y, p.z);
    if (comp) {
      if (comp.id === "engine") {
        this.triggerEngineExplosion("detonation in engine spaces");
      }
      const before = comp.holes.length;
      const wp = this.worldPos(p, V());
      const seaH = this.ocean.height(wp.x, wp.z, this.time);
      const hole = this.sim.addBreach(comp, p, power * (src === "barrel" ? 0.5 : 1), seaH);
      if (hole) {
        if (comp.holes.length > before) this.makeHoleVisual(hole);
        this.say(`HULL BREACH in ${comp.name}! Water is flooding in!`, "alert");
        this.audio.creak(1.3);
        this.shake = Math.min(1.8, this.shake + 0.5);
      }
    }
    // Lärm
    this.noiseT = 1.2;
    this.noiseRange = 2.4;
    this.noisePos.copy(p);
    // Rumpf-Knarren
    setTimeout(() => this.audio.creak(0.8), 700 + Math.random() * 800);
  }

  private makeHoleVisual(h: { pos: THREE.Vector3; nx: number; ny: number; nz: number; area: number }) {
    const r = Math.sqrt(h.area / Math.PI) * 0.9;
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 14), new THREE.MeshBasicMaterial({ color: 0x020a10, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r * 1.35, 14), new THREE.MeshBasicMaterial({ color: 0x3a2a1a, side: THREE.DoubleSide }));
    ring.position.z = 0.002;
    g.add(disc, ring);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3 + Math.random() * 0.3, 0.04), new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.8, roughness: 0.4 }));
      sp.position.set(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, 0.12);
      sp.rotation.z = a + Math.random() - 0.5;
      sp.rotation.x = (Math.random() - 0.5) * 0.8;
      g.add(sp);
    }
    g.position.copy(h.pos);
    g.lookAt(h.pos.clone().add(V(h.nx, h.ny, h.nz)));
    this.ship.holeGroup.add(g);
  }

  private updateBarrels(dt: number) {
    for (const b of this.ship.barrels) {
      if (b.dead) continue;
      if (b.fuse > 0) {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          b.dead = true;
          b.mesh.visible = false;
          this.ship.world.remove(b.collider);
          this.explode(b.pos.clone(), 0.7, "barrel");
        }
      }
    }
  }

  private triggerEngineExplosion(reason: string) {
    if (this.engineExploded) return;
    this.engineExploded = true;
    this.supervisor.destroyEngine();
    this.alarm = true;

    // Diesel generator room at x=0, y=-3.5, z=-50
    const engPos = V(0, -3.5, -50);
    const wp = this.worldPos(engPos, V());

    for (let i = 0; i < 70; i++) {
      const v = V((Math.random() - 0.5) * 8, 3 + Math.random() * 8, (Math.random() - 0.5) * 8);
      this.pa.emit(wp.x, wp.y, wp.z, v.x, v.y, v.z, 0.8 + Math.random(), 0.15, 0.04, 1, 0.8, 0.2, 1, 10, 0.4);
    }
    for (let i = 0; i < 60; i++) {
      const v = V((Math.random() - 0.5) * 4, 1 + Math.random() * 4, (Math.random() - 0.5) * 4);
      this.pn.emit(wp.x, wp.y, wp.z, v.x, v.y, v.z, 4 + Math.random() * 4, 0.6, 2.5, 0.15, 0.15, 0.15, 0.85, -0.6, 0.8);
    }

    this.audio.explosion(this.posAudio(engPos), 1.5);
    this.shake = Math.min(2.0, this.shake + 1.2);
    this.say(`ENGINE ROOM GENERATOR EXPLODED (${reason})! Motor breakdown – propulsion lost!`, "alert");
  }

  // ------------------------------------------------------------------ Schaden / Tod
  damagePlayer(amount: number, cause: string, silent = false) {
    if (this.mode === "sandbox" || this.supervisor.isGodMode()) return;
    const p = this.player;
    amount = this.supervisor.filterDamage(amount);
    if (!p.alive || amount <= 0) return;
    let a = amount;
    if (p.armor > 0) {
      const ab = Math.min(p.armor, a * 0.5);
      p.armor -= ab;
      a -= ab;
    }
    p.health -= a;
    if (!silent) {
      this.dmgFlash = Math.min(1, this.dmgFlash + a / 35);
      this.audio.hurt();
      this.shake = Math.min(1.2, this.shake + a / 40);
    }
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      this.dead = true;
      this.deathCause = cause;
      this.deadT = 0;
      this.vm.root.visible = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  // ------------------------------------------------------------------ Wachen
  private updateGuards(dt: number) {
    if (!this.guards.length) return;
    const pe = this.eyeLocal();
    const pb = this.player.body;
    const slide: [number, number] = this.sim.tiltDeg > 6 ? this.sim.slideVector() : [0, 0];
    const diff = this.settings.difficulty === "easy" ? 0.7 : this.settings.difficulty === "hard" ? 1.35 : 1;
    const ctx = {
      world: this.ship.world,
      eye: pe,
      px: pb.x,
      py: pb.y,
      pz: pb.z,
      playerAlive: this.player.alive && !this.escapeState && this.time > 4,
      doors: this.ship.doors,
      diff,
      slide,
      noise: this.noiseT > 0 ? this.noiseRange : 0,
      noisePos: this.noisePos,
      underwater: (x: number, y: number, z: number) => y < this.waterAt(x, y, z),
      shoot: (g: Guard, from: THREE.Vector3, hit: boolean) => {
        const pa = this.posAudio(from);
        this.audio.shot("pistol", pa);
        const target = pe.clone();
        if (!hit) target.add(V((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.2));
        const origin = from.clone().add(V(-Math.sin(g.yaw) * 0.6, -0.1, -Math.cos(g.yaw) * 0.6));
        this.tracer(origin, target, 0xffb070);
        if (hit) this.damagePlayer(7 * diff, "Shot by a guard");
        else {
          const hp = target.clone();
          this.sparks(hp, V(0, 1, 0), 3);
          this.audio.bulletImpact(this.posAudio(hp));
        }
      },
    };
    for (const g of this.guards) {
      g.update(dt, ctx);
      // Kollisionssicherheit: Wachen fallen nicht ins Leere
    }
  }

  // ------------------------------------------------------------------ Interaktion
  private updateInteraction(_dt: number) {
    this.prompt = "";
    this.promptKind = "";
    this.promptTarget = null;
    if (this.dead || this.escapeState) return;
    if (this.activeVessel === "battleship") return;
    const eye = this.eyeLocal();
    const dir = this.lookDirLocal();
    const world = this.ship.world;
    let best = -1e9;
    let bestAct: (() => void) | null = null;
    let bestText = "";
    let bestKind: "" | "normal" | "locked" | "confirm" = "";
    const secCtx = this.securityContext();
    const doorList = this.theatre === "orbital" ? this.spaceStation.doors : this.ship.doors;
    for (const d of doorList) {
      const to = d.center.clone().sub(eye);
      const dist = to.length();
      if (dist > 2.7) continue;
      const dot = to.dot(dir) / dist;
      if (dot < 0.55 && dist > 1.0) continue;
      const tgt = d.center.clone().addScaledVector(to, -0.3 / dist);
      if (!world.lineClear(eye.x, eye.y, eye.z, tgt.x, tgt.y, tgt.z)) continue;
      const score = -dist + dot * 1.5;
      if (score > best) {
        best = score;
        const pr = this.doorSecurity.prompt(d, secCtx);
        bestKind = pr.kind;
        bestText = pr.text;
        bestAct = () => this.useDoor(d);
      }
    }
    if (this.theatre === "orbital") {
      const consolePos = new THREE.Vector3(0, STATION_BASE_Y + 0.65, 3);
      const distCon = consolePos.distanceTo(eye);
      if (distCon < 3.6 || this.orbitalLaserMode) {
        const score = 6.0;
        if (score > best || this.orbitalLaserMode) {
          best = score;
          bestKind = this.orbitalLaserMode ? "confirm" : "normal";
          bestText = this.orbitalLaserMode
            ? `ORBITAL DEATH RAY [LMB] Fire · [Q/Z] Zoom (${this.orbitalZoomFov.toFixed(0)}°) · [E] Exit`
            : "Orbital Command Console [E] – Activate Death Ray";
          bestAct = () => this.toggleOrbitalLaser();
        }
      }
    }
    for (const lb of this.ship.lifeboats) {
      const dd = Math.hypot(eye.x - lb.zone.x, eye.z - lb.zone.z);
      if (dd < 2.4 && Math.abs(eye.y - lb.zone.y) < 3 && !lb.launched) {
        const score = 5 - dd;
        if (score > best) {
          best = score;
          const ok = this.sim.sinking || this.mode === "sandbox";
          bestKind = ok ? "normal" : "locked";
          bestText = ok ? "Board the lifeboat" : "Lifeboat – sink the ship first!";
          bestAct = () => this.boardLifeboat(lb);
        }
      }
    }
    // Wheelhouse Bridge Helm & Telegraph Station
    const bridgeHelmPos = new THREE.Vector3(0, 12.6, -46.5);
    const toHelm = bridgeHelmPos.clone().sub(eye);
    const distHelm = toHelm.length();
    if (distHelm < 3.2 || this.helmMode) {
      const score = 5.0;
      if (score > best || this.helmMode) {
        best = score;
        bestKind = this.helmMode ? "confirm" : "normal";
        const helm = this.supervisor.helm;
        if (!this.helmMode) {
          bestText = `Take the Helm [E] (${helm.telegraph.toUpperCase()} · Rudder ${helm.rudderDeg.toFixed(0)}°)`;
          bestAct = () => {
            this.helmMode = true;
            this.audio.click();
            this.say("HELM ACTIVE: [W/S] Telegraph · [A/D] Rudder · [E] Exit", "good");
          };
        } else {
          bestText = `HELM ACTIVE: [W/S] ${helm.telegraph.toUpperCase()} (${helm.speed.toFixed(1)} m/s) · [A/D] Rudder ${helm.rudderDeg.toFixed(0)}° · [E] Exit`;
          bestAct = () => {
            this.helmMode = false;
            this.audio.click();
            this.say("Exited Helm Mode – walking freely", "info");
          };
        }
      }
    }
    this.prompt = bestText;
    this.promptKind = bestKind;
    this.promptTarget = bestAct;
    if (this.input.pressed("interact")) {
      if (bestAct) bestAct();
    }
  }

  /** Snapshot of everything the door safety checks need to read. */
  private securityContext(): SecurityContext {
    return {
      now: this.time,
      hasKey: this.hasKey,
      sandbox: this.mode === "sandbox",
      sinking: this.sim.sinking,
      compartments: this.ship.compartments,
    };
  }

  private useDoor(d: Door) {
    const decision = this.doorSecurity.request(d, this.securityContext());
    if (decision.action === "deny") {
      this.audio.locked();
      this.say(decision.message, "warn");
      return;
    }
    if (decision.action === "confirm") {
      this.audio.locked();
      this.say(decision.message, "alert");
      return;
    }
    const p = this.player.body;
    if (d.locked) {
      const card = d.locked === "red" ? "red" : "blue";
      d.unlock();
      this.say(`${d.name} unlocked with the ${card} card.`, "good");
    } else if (decision.level === "warn" || decision.level === "alert") {
      this.say(decision.message, "warn");
    }
    d.toggle(p.x, p.z);
  }

  private updatePickups() {
    const pb = this.player.body;
    const p = this.player;
    if (this.dead || this.escapeState) return;
    for (const pk of this.ship.pickups) {
      if (pk.taken) continue;
      const dx = pb.x - pk.pos.x,
        dz = pb.z - pk.pos.z,
        dy = pb.y + 0.9 - pk.pos.y;
      if (dx * dx + dz * dz > 1.1 * 1.1 || Math.abs(dy) > 1.6) continue;
      let ok = true;
      switch (pk.type) {
        case "key_red":
          this.hasKey.red = true;
          this.say("Red access card found! (Engine control room)", "good");
          break;
        case "key_blue":
          this.hasKey.blue = true;
          this.say("Blue access card found! (Cargo Hold 2 gate)", "good");
          break;
        case "medkit":
          if (p.health >= 100) {
            ok = false;
            this.hintOnce("Health full – medkit stays where it is.");
          } else {
            p.health = Math.min(100, p.health + 50);
            this.say("+50 health", "pickup");
          }
          break;
        case "armor":
          if (p.armor >= 100) ok = false;
          else {
            p.armor = 100;
            this.say("Body armor equipped", "pickup");
          }
          break;
        case "tnt":
          this.tnt += pk.amount;
          this.say(`+${pk.amount} TNT`, "pickup");
          break;
        case "ammo_pistol":
          this.ammo.pistol.res += pk.amount;
          this.say(`+${pk.amount} pistol ammo`, "pickup");
          break;
        case "ammo_shotgun":
          this.ammo.shotgun.res += pk.amount;
          this.say(`+${pk.amount} shotgun shells`, "pickup");
          break;
        case "ammo_rifle":
          this.ammo.rifle.res += pk.amount;
          this.say(`+${pk.amount} rifle ammo`, "pickup");
          break;
        case "weapon_shotgun":
          this.owned.shotgun = true;
          this.ammo.shotgun.mag = 6;
          this.ammo.shotgun.res += 6;
          this.say("Shotgun picked up (key 2)", "good");
          break;
        case "weapon_rifle":
          this.owned.rifle = true;
          this.ammo.rifle.mag = 30;
          this.say("Assault rifle picked up (key 3)", "good");
          break;
      }
      if (ok) {
        pk.taken = true;
        pk.mesh.visible = false;
        this.audio.pickup();
      }
    }
  }
  private lastHint = "";
  private lastHintT = 0;
  private hintOnce(t: string) {
    if (this.lastHint === t && this.time - this.lastHintT < 6) return;
    this.lastHint = t;
    this.lastHintT = this.time;
    this.say(t, "info");
  }

  // ------------------------------------------------------------------ Mission
  private floodedMsg = new Set<string>();
  private objState = { allArmed: false, sunkMsg: false, detMsg: false };
  private updateMission() {
    const armed = this.ship.markers.filter((m) => m.armed).length;
    if (armed !== this.armedCount) this.armedCount = armed;
    if (this.sim.sinking && !this.objState.sunkMsg) {
      this.objState.sunkMsg = true;
      this.say("The ship is sinking! Get to the lifeboat – HURRY! (E at the boat)", "alert");
      this.audio.creak(1.5);
    }
    if (!this.sim.sinking) {
      for (const c of this.ship.compartments) {
        if (c.fill > 0.97 && !this.floodedMsg.has(c.id)) {
          this.floodedMsg.add(c.id);
          this.say(`${c.name} has fully flooded – the ship is still afloat. Flood another compartment!`, "warn");
        }
      }
    }
    if (this.armedCount >= 2 && !this.objState.allArmed) {
      this.objState.allArmed = true;
      this.say("Enough detonation points armed. Detonate with G (remote) – then run!", "good");
    }
  }

  private objectives(): { text: string; done: boolean }[] {
    if (this.mode === "sandbox") {
      return [
        { text: "Blow up the freighter as you like", done: false },
        { text: "Lifeboat (E) ends the sandbox", done: false },
      ];
    }
    const planted = this.ship.markers.filter((m) => m.armed).length;
    return [
      { text: "Find the blue access card (cabins, deck 1)", done: this.hasKey.blue },
      { text: "Red card (bridge) for the engine room – optional", done: this.hasKey.red },
      { text: `Plant TNT on 2 orange detonation points in the hull (${Math.min(planted, 2)}/2)`, done: planted >= 2 },
      { text: "Detonate charges (G) – sink the ship", done: this.sim.sinking },
      { text: "Escape to the lifeboat (E)", done: this.escapeState !== null },
    ];
  }

  // ------------------------------------------------------------------ Rettungsboot
  private boardLifeboat(lb: Lifeboat) {
    if (this.escapeState) return;
    if (!this.sim.sinking && this.mode !== "sandbox") {
      this.audio.locked();
      this.say("The ship is still afloat! Sink it first.", "warn");
      return;
    }
    lb.launched = true;
    this.scene.attach(lb.group);
    const start = lb.group.position.clone();
    const dir = V(lb.side, 0, 0);
    this.escapeState = { boat: lb, t: 0, phase: 0, startPos: start, dir, speed: 0 };
    this.vm.root.visible = false;
    this.say("Lowering the lifeboat …", "good");
    this.audio.door("hatch");
    if (this.mode === "sandbox") this.sim.forceSink = true;
    this.noiseT = 0;
  }

  private updateEscape(dt: number) {
    const e = this.escapeState;
    if (!e) return;
    e.t += dt;
    const boat = e.boat.group;
    const sea = this.ocean.height(boat.position.x, boat.position.z, this.time);
    if (e.phase === 0) {
      const dur = 4.5;
      const k = Math.min(1, e.t / dur);
      const ease = k * k * (3 - 2 * k);
      const tx = e.startPos.x + e.dir.x * 5;
      boat.position.x = e.startPos.x + (tx - e.startPos.x) * ease;
      boat.position.z = e.startPos.z;
      boat.position.y = e.startPos.y + (sea + 0.35 - e.startPos.y) * ease;
      boat.rotation.y = e.dir.x * Math.PI / 2;
      boat.rotation.x = Math.sin(e.t * 2) * 0.03;
      boat.rotation.z = Math.sin(e.t * 1.7) * 0.05;
      if (k >= 1) {
        e.phase = 1;
        e.t = 0;
        this.audio.splash(undefined, true);
        this.audio.door("close");
        for (let i = 0; i < 30; i++) this.pn.emit(boat.position.x + (Math.random() - 0.5) * 3, sea, boat.position.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3, 1.5, 0.4, 1.0, 0.9, 0.95, 1, 0.6, 9, 0.3);
        this.say("Engine running – away from the sinking ship!", "good");
      }
    } else {
      e.speed = Math.min(7, e.speed + dt * 1.8);
      boat.position.x += e.dir.x * e.speed * dt;
      const h = this.ocean.height(boat.position.x, boat.position.z, this.time);
      const hf = this.ocean.height(boat.position.x + e.dir.x * 3, boat.position.z, this.time);
      boat.position.y += (h + 0.35 - boat.position.y) * Math.min(1, dt * 6);
      boat.rotation.z = Math.sin(e.t * 1.6) * 0.06 + (hf - h) * 0.05 * e.dir.x;
      boat.rotation.x = Math.sin(e.t * 1.3) * 0.04;
      // Gischt
      if (Math.random() < dt * 40) this.pn.emit(boat.position.x - e.dir.x * 3.5, h, boat.position.z + (Math.random() - 0.5), -e.dir.x * 2, 1.5, (Math.random() - 0.5), 1.2, 0.5, 1.4, 0.9, 0.95, 1, 0.4, 3, 0.5);
      if (!this.sim.sinking) this.sim.forceSink = true;
      if ((this.sim.sunk || e.t > 40) && !this.ended) {
        this.ended = true;
        this.audio.win();
        this.cb.onEnd({ kind: "win", cause: "Entkommen", time: this.time, kills: this.kills, flood: this.sim.F, mode: this.mode });
      }
    }
  }

  // ------------------------------------------------------------------ Weltstimmung
  private updateWorldFx(dt: number) {
    const t = this.time;
    const env = this.env;
    // Rauch aus dem Schornstein
    const eng = this.ship.compartments[0];
    const engineOn = eng.fill < 0.55 && !this.sim.sunk;
    this.smokeT -= dt;
    if (this.smokeT <= 0 && engineOn && this.settings.particles > 0.1) {
      this.smokeT = 0.07;
      const w = this.worldPos(this.ship.funnelTop, V());
      const wind = 3 + env.windMul * 5;
      this.pn.emit(w.x, w.y, w.z, -wind * 0.4 + (Math.random() - 0.5), 2.5 + Math.random(), (Math.random() - 0.5) * 1.2, 7, 1.6, 9, 0.18, 0.18, 0.2, 0.55, -0.15, 0.25);
    }
    // Wasserstrahlen aus Löchern + Schaum
    let rush = 0;
    const eye = this.eyeLocal();
    for (const c of this.ship.compartments) {
      for (const h of c.holes) {
        const wy = this.sim.worldY(h.pos.x, h.pos.y, h.pos.z);
        const head = Math.max(0, -Math.max(wy, c.worldLevel));
        if (head <= 0.05) continue;
        const flowRate = Math.min(1, head / 5);
        const d = h.pos.distanceTo(eye);
        rush += (Math.min(1, (h.area * flowRate) / 3) * 1.0) / (1 + d * 0.12);
        if (Math.random() < dt * 90 * Math.min(1, this.settings.particles + 0.2)) {
          const w = this.worldPos(h.pos, V());
          const n = V(h.nx, h.ny, h.nz).transformDirection(this.ship.group.matrixWorld);
          const sp = 3 + head * 1.0 + Math.random() * 3;
          this.pn.emit(
            w.x + (Math.random() - 0.5) * 0.6,
            w.y + (Math.random() - 0.5) * 0.6,
            w.z + (Math.random() - 0.5) * 0.6,
            n.x * sp + (Math.random() - 0.5) * 1.5,
            n.y * sp + Math.random() * 1.5,
            n.z * sp + (Math.random() - 0.5) * 1.5,
            0.7,
            0.12,
            0.4,
            0.75,
            0.88,
            1,
            0.55,
            9,
            0.6,
          );
        }
      }
    }
    this.rushLevel = Math.min(1, rush);

    // Untergang: Schaum & Luftblasen
    if (this.sim.sinking && !this.sim.sunk) {
      this.foamT -= dt;
      if (this.foamT <= 0) {
        this.foamT = 0.05;
        const z = (Math.random() - 0.5) * 120;
        const side = Math.random() < 0.5 ? -1 : 1;
        const lp = V(side * (11 + Math.random() * 2), 0, z);
        const w = this.worldPos(lp, V());
        const m = this.ship.group.matrixWorld.elements;
        void m;
        const sh = this.ocean.height(w.x, w.z, t);
        this.pn.emit(w.x, sh + 0.1, w.z, side * 0.5, 0.6, (Math.random() - 0.5), 4, 2, 6, 0.95, 0.97, 1, 0.5, 0, 0.3);
      }
      this.creakTimer -= dt;
      if (this.creakTimer <= 0) {
        this.creakTimer = 2 + Math.random() * 3;
        this.audio.creak(1.2);
        this.shake = Math.min(1, this.shake + 0.25);
      }
    }
    // Alarmleuchten
    const blink = Math.sin(t * 8) > 0;
    this.ship.alarmLights.forEach((l) => (l.visible = this.alarm && blink));
    this.ship.navLights.forEach((l, i) => {
      if (i < 2) return;
      l.visible = Math.sin(t * 2.2 + i) > -0.2;
    });

    // Möwen
    for (const g of this.gulls) {
      g.a += g.s * dt;
      const x = Math.cos(g.a) * g.r,
        z = Math.sin(g.a) * g.r;
      g.g.position.set(x, g.h + Math.sin(t * 0.5 + g.ph) * 2, z);
      g.g.rotation.y = -g.a;
      g.g.rotation.z = Math.sin(t * 0.6 + g.ph) * 0.15;
      const f = Math.sin(t * 7 + g.ph) * 0.5;
      g.wl.rotation.z = f;
      g.wr.rotation.z = -f;
      g.g.visible = env.storm < 0.8 && env.night < 0.7;
    }
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 6 + Math.random() * 10;
      if (env.storm < 0.8 && this.indoor < 0.5) this.audio.gull();
    }
    // Regen
    if (this.rain.visible) {
      const m = this.rain.material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = t;
      m.uniforms.uCam.value.copy(this.camera.position);
      m.uniforms.uAlpha.value = this.indoor > 0.5 ? 0 : 0.35;
    }
    // Tropfen auf der Kamera/Blitz bei Sturm
    if (env.storm > 0.8 && Math.random() < dt * 0.1) {
      this.lightning = 1;
      setTimeout(() => this.audio.explosion({ dist: 120, pan: 0 }, 1.5), 600 + Math.random() * 1500);
    }
    this.lightning = Math.max(0, this.lightning - dt * 3);
    // Mündungslicht abklingen
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 500);
    for (const l of this.flashLights) l.intensity = Math.max(0, l.intensity - dt * 1500);
    for (const tr of this.tracers) {
      if (tr.t > 0) {
        tr.t -= dt;
        if (tr.t <= 0) tr.line.visible = false;
      }
    }
    // Keep Freighter visible while sinking in Sandbox/Battleship mode so it never despawns
    if (this.sim.sunk && this.mode !== "sandbox" && this.activeVessel !== "battleship") {
      this.ship.group.visible = false;
    } else {
      this.ship.group.visible = true;
    }
    for (const c of this.ship.compartments) {
      const wm = c.waterMesh;
      wm.visible = c.fill > 0.004 && !this.sim.sunk;
      if (wm.visible) {
        const cz = (c.min.z + c.max.z) / 2;
        const wp = this.worldPos(V(0, c.level, cz), V());
        wm.position.set(wp.x, c.worldLevel, wp.z);
        // Clip-Ebenen aktualisieren
        const mw = this.ship.group.matrixWorld;
        const nrm = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
        const pts = [V(c.min.x, 0, 0), V(c.max.x, 0, 0), V(0, c.min.y, 0), V(0, c.max.y, 0), V(0, 0, c.min.z), V(0, 0, c.max.z)];
        // Ebene i: Normale zeigt ins Innere
        const inward = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
        for (let i = 0; i < 6; i++) {
          const nw = inward[i].clone().transformDirection(mw);
          const pw = pts[i].clone().applyMatrix4(mw);
          c.planes[i].setFromNormalAndCoplanarPoint(nw, pw);
        }
        void nrm;
      }
    }
  }
  rushLevel = 0;
  lightning = 0;

  private updateEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (!e.update(dt)) {
        e.dispose?.();
        this.effects.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ Kamera/Licht/Audio
  private updateCamera(dt: number) {
    const cam = this.camera;
    const p = this.player;
    const st = this.settings;
    const e = this.escapeState;
    if (e) {
      const boat = e.boat.group;
      const off = V(0.8, 3.4, 6.8).applyQuaternion(boat.quaternion);
      cam.position.copy(boat.position).add(off);
      const target = this.ship.group.position.clone().add(V(0, 8, 0));
      const m = new THREE.Matrix4().lookAt(cam.position, target, V(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, Math.min(1, dt * 3));
      this.ship.group.updateMatrixWorld(true);
      return;
    }
    if (this.orbitalLaserMode) {
      this.vm.root.visible = false;
      const zoomT = Math.max(0, Math.min(1, (this.orbitalZoomFov - 8) / (72 - 8)));
      const camY = 34 + zoomT * (STATION_BASE_Y - 46);
      const targetFov = 36 + zoomT * 34;
      if (Math.abs(cam.fov - targetFov) > 0.05) {
        cam.fov = targetFov;
        cam.updateProjectionMatrix();
      }
      cam.position.set(this.orbitalAimX, camY, this.orbitalAimZ);
      const lookTarget = V(this.orbitalAimX, 0, this.orbitalAimZ);
      const m = new THREE.Matrix4().lookAt(cam.position, lookTarget, V(0, 0, -1));
      cam.quaternion.setFromRotationMatrix(m);
      cam.updateMatrixWorld(true);
      return;
    }
    this.vm.root.visible = !this.dead && !this.escapeState && this.activeVessel !== "battleship";
    if (Math.abs(cam.fov - st.fov) > 0.05) {
      cam.fov = st.fov;
      cam.updateProjectionMatrix();
    }
    if (this.activeVessel === "battleship" && this.battleships[0]) {
      const bs = this.battleships[0];
      const back = V(Math.sin(p.yaw) * Math.cos(p.pitch), -Math.sin(p.pitch), Math.cos(p.yaw) * Math.cos(p.pitch));
      const anchor = bs.group.position.clone().add(V(0, 8.5, 0));
      cam.position.copy(anchor).addScaledVector(back, 38);
      cam.position.y = Math.max(this.ocean.height(cam.position.x, cam.position.z, this.time) + 2.0, cam.position.y);
      const lookTarget = anchor.clone().addScaledVector(back, -50);
      const m = new THREE.Matrix4().lookAt(cam.position, lookTarget, V(0, 1, 0));
      cam.quaternion.setFromRotationMatrix(m);
      cam.updateMatrixWorld(true);
      return;
    }
    const eye = this.eyeLocal();
    let bobY = 0,
      bobX = 0;
    if (st.headBob && p.body.onGround && p.speed > 0.5 && !this.dead) {
      const amt = Math.min(1, p.speed / 4) * (p.sprinting ? 1.4 : 1);
      bobY = Math.sin(p.bob * 2) * 0.03 * amt;
      bobX = Math.cos(p.bob) * 0.02 * amt;
    }
    let fall = 0;
    if (this.dead) {
      fall = Math.min(1, this.deadT * 1.5);
      eye.y -= fall * 1.2;
    }
    const sk = this.shake * this.shake * st.shake;
    const shk = V((Math.random() - 0.5) * 0.06 * sk, (Math.random() - 0.5) * 0.06 * sk, 0);
    eye.y += bobY + shk.y;
    const lookRight = V(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    eye.addScaledVector(lookRight, bobX + shk.x);
    const onBsDeck = this.battleships.some((bs) => {
      const wx = p.body.x + this.ship.group.position.x;
      const wz = p.body.z + this.ship.group.position.z;
      return Math.abs(wx - bs.baseX) <= bs.deckBounds.maxX + 0.8 && Math.abs(wz - bs.baseZ) <= bs.deckBounds.maxZ + 0.8;
    });
    const ew =
      this.theatre === "orbital"
        ? eye
        : onBsDeck
          ? V(eye.x + this.ship.group.position.x, eye.y, eye.z + this.ship.group.position.z)
          : this.worldPos(eye, V());
    cam.position.copy(ew);
    const lean = Math.sin(p.bob) * 0.004 * (p.speed > 1 ? 1 : 0);
    this.tmpE.set(p.pitch + (Math.random() - 0.5) * 0.02 * sk, p.yaw + (Math.random() - 0.5) * 0.02 * sk, lean + fall * 1.2 + (Math.random() - 0.5) * 0.02 * sk, "YXZ");
    this.tmpQ.setFromEuler(this.tmpE);
    if (this.theatre === "orbital" || onBsDeck) cam.quaternion.copy(this.tmpQ);
    else cam.quaternion.copy(this.ship.group.quaternion).multiply(this.tmpQ);
    cam.updateMatrixWorld(true);
  }

  private updateLights(dt: number) {
    const env = this.env;
    const st = this.settings;
    const cam = this.camera;
    const p = this.player;
    const under = this.cameraUnderwater();
    this.waterOverlay = under;
    const ind = this.indoor;
    this.sun.color.copy(env.sunColor);
    this.sun.intensity = env.sunIntensity * (1 - 0.88 * ind) * (1 + this.lightning * 0.5);
    this.sun.position.copy(cam.position).addScaledVector(env.sunDir, 160);
    this.sun.target.position.copy(cam.position);
    this.sun.target.updateMatrixWorld();
    this.hemi.color.copy(env.hemiSky);
    this.hemi.groundColor.copy(env.hemiGround);
    const depthDark = under ? 0.45 : 1;
    this.hemi.intensity = (env.hemiIntensity * (1 - 0.75 * ind) + 0.1 * ind + this.lightning * 2.5) * depthDark;
    const spaceMix = Math.max(0, Math.min(1, (cam.position.y - 60) / 140));
    const fogD = this.orbitalLaserMode
      ? 0.00025
      : 0.0016 * (1.15 - st.viewDistance) * (1 + env.storm * 1.2) * (1 - spaceMix * 0.85);
    const spaceColor = new THREE.Color(0x02040a);
    const fogC = under
      ? new THREE.Color(0.02, 0.2, 0.28).multiplyScalar(0.4 + 0.6 * env.night * 0 + 0.6)
      : env.fogColor.clone().lerp(spaceColor, spaceMix);
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(fogC.getHex(), fogD);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(fogC);
    fog.density = under ? 0.075 : fogD;
    this.scene.background = spaceMix > 0.15 ? fogC : null;
    if (this.spaceStation.starPoints) {
      this.spaceStation.starPoints.visible = spaceMix > 0.1;
    }
    this.ocean.apply(env, fog.density, st.waveHeight);
    this.ocean.update(cam.position, this.time, this.shipInv(), !this.sim.sunk, under);
    this.sky.update(cam.position, this.time);
    // Lampen-Pool
    const lamps = this.ship.lamps;
    const el = this.eyeLocal();
    const power = this.sim.sinking ? Math.max(0.0, 1 - this.sim.sinkT * 0.05) : 1;
    const flick = this.sim.sinking || this.alarm ? 0.6 + 0.4 * Math.sin(this.time * 17 + Math.sin(this.time * 5) * 3) : 1;
    const pool = this.lampPool;
    if (pool.length) {
      const picked: number[] = [];
      const dists: number[] = [];
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        const d = (l.pos.x - el.x) ** 2 + (l.pos.y - el.y) ** 2 * 1.5 + (l.pos.z - el.z) ** 2;
        if (picked.length < pool.length) {
          picked.push(i);
          dists.push(d);
        } else {
          let wi = 0;
          for (let k = 1; k < dists.length; k++) if (dists[k] > dists[wi]) wi = k;
          if (d < dists[wi]) {
            dists[wi] = d;
            picked[wi] = i;
          }
        }
      }
      const redMix = this.alarm ? 0.5 + 0.5 * Math.sin(this.time * 6) : 0;
      for (let k = 0; k < pool.length; k++) {
        const L = pool[k];
        if (k < picked.length) {
          const lp = lamps[picked[k]];
          L.position.copy(lp.pos);
          const outdoor = lp.zone === -1 && lp.pos.y > 4 && this.indoor < 0.5;
          const nightBoost = outdoor ? (0.2 + env.night * 1.2) : 1;
          L.intensity = 38 * power * flick * nightBoost * (under ? 0.5 : 1);
          L.color.setRGB(1, 0.94 - redMix * 0.5, 0.8 - redMix * 0.6);
        } else L.intensity = 0;
      }
    }
    // Lampenmaterial dimmen
    this.ship.lampMat.color.setRGB(1, 0.95, 0.8).multiplyScalar(Math.max(0.15, power * (0.7 + 0.3 * flick)));
    // Taschenlampe
    this.flashlight.intensity += ((this.flashOn && !this.dead ? 140 : 0) - this.flashlight.intensity) * Math.min(1, dt * 20);
    this.headLight = p.alive ? 1 : 0;
    this.camera.far = 4000;
  }

  private _inv = new THREE.Matrix4();
  private shipInv(): THREE.Matrix4 {
    return this._inv.copy(this.ship.group.matrixWorld).invert();
  }

  private cameraUnderwater(): boolean {
    if (this.theatre === "orbital") return false;
    if (this.escapeState) {
      const h = this.ocean.height(this.camera.position.x, this.camera.position.z, this.time);
      return this.camera.position.y < h - 0.05;
    }
    const e = this.eyeLocal();
    const lvl = this.waterAt(e.x, e.y + (this.dead ? -1.2 : 0), e.z);
    return e.y < lvl;
  }

  private updateAudio(dt: number) {
    const env = this.env;
    const under = this.waterOverlay;
    const engPos = V(0, -3, -50);
    const dist = this.eyeLocal().distanceTo(engPos);
    const eng = this.ship.compartments[0];
    const engineRun = eng.fill < 0.4 && !this.sim.sunk && !this.supervisor.isEngineDestroyed() ? 1 : 0;
    const engineVol = engineRun * Math.max(0.1, Math.min(1, 1.2 - dist / 45));
    this.audio.update(dt, {
      engine: engineVol * (this.indoor > 0.5 ? 1 : 0.5),
      wind: env.windMul,
      waves: Math.min(1, this.ocean.amp / 1.5),
      underwater: under,
      inside: this.indoor > 0.5,
      rush: this.rushLevel,
      alarm: this.alarm && !this.dead && !this.escapeState,
      heart: this.player.health < 30 && this.player.alive ? 1 - this.player.health / 30 : 0,
      tension: this.guards.some((g) => g.state === "chase" && !g.dead) ? 1 : this.sim.sinking ? 0.8 : 0,
      musicOn: !this.dead,
    });
  }

  // ------------------------------------------------------------------ Render
  private render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (!this.dead && !this.escapeState && this.vm.root.visible && this.activeVessel !== "battleship") {
      const pb = this.player;
      const [ldx, ldy] = [this.input.lookX, this.input.lookY];
      this.vm.update(this.paused ? 0 : 0.016, { speed: pb.speed * (pb.sprinting ? 1.2 : 1), onGround: pb.body.onGround, lookDX: ldx, lookDY: ldy, reloading: this.reloading }, this.dyns.length > 0);
      r.clearDepth();
      r.render(this.vmScene, this.vmCam);
    }
  }

  // ------------------------------------------------------------------ HUD
  private pushHud() {
    const p = this.player;
    const w = WEAPONS[this.cur];
    const a = this.cur === "tnt" ? { mag: 0, res: 0 } : this.ammo[this.cur];
    const dir = this.lookDirLocal();
    const heading = ((Math.atan2(dir.x, dir.z) * 180) / Math.PI + 360) % 360;
    const now = this.time;
    this.msgs = this.msgs.filter((m) => m.t > now);
    const chase = this.guards.some((g) => g.state === "chase" && !g.dead);
    const m = this.ship.group.matrixWorld.elements;
    void m;
    const hud: HudState = {
      hp: p.health,
      armor: p.armor,
      weapon: this.cur,
      weaponName: w.name,
      mag: a.mag,
      reserve: a.res,
      tnt: this.tnt,
      owned: { ...this.owned },
      oxygen: p.oxygen,
      underwater: this.waterOverlay,
      wading: p.wading,
      prompt: this.prompt,
      promptKind: this.promptKind,
      objectives: this.objectives(),
      messages: this.msgs.map((x) => ({ id: x.id, text: x.text, kind: x.kind })),
      flood: this.ship.compartments.map((c) => ({ name: c.name, fill: c.fill, flow: c.flow })),
      F: this.sim.F,
      sinking: this.sim.sinking,
      tilt: this.sim.tiltDeg,
      pitchDeg: (this.sim.pitch * 180) / Math.PI,
      rollDeg: (this.sim.roll * 180) / Math.PI,
      alarm: this.alarm,
      fps: Math.round(this.fps),
      hit: this.hitMarker,
      dmg: this.dmgFlash,
      keys: { ...this.hasKey },
      armedMarkers: this.armedCount,
      planted: this.dyns.length,
      mode: this.mode,
      time: this.time,
      kills: this.kills,
      reloading: this.reloading,
      chase,
      heading,
      escape: !!this.escapeState,
      detonatable: this.dyns.length > 0,
      sprint: p.sprinting,
      crouch: p.crouch > 0.5,
      locked: this.lockOk,
      dragMode: this.dragMode,
      sunk: this.sim.sunk,
      guardsAlive: this.guards.filter((g) => !g.dead).length,
      terminal: this.terminal.recent(10),
      terminalPinned: this.terminalPinned,
      godMode: this.supervisor.isGodMode(),
      godModeHoldProgress: this.godModeHoldProgress,
      tabletOpen: this.tabletOpen,
      activeVessel: this.activeVessel,
      vesselSpeed: this.activeVessel === "battleship" && this.battleships[0] ? this.battleships[0].speed : this.supervisor.helm.speed,
      vesselRudder: this.activeVessel === "battleship" && this.battleships[0] ? this.battleships[0].rudderDeg : this.supervisor.helm.rudderDeg,
      vesselTelegraph:
        this.activeVessel === "battleship" && this.battleships[0]
          ? `${this.battleships[0].targetSpeed.toFixed(0)} m/s`
          : this.supervisor.helm.telegraph.toUpperCase(),
      battleshipHp: this.battleships[0] ? Math.round(this.battleships[0].hp) : 0,
      battleshipAvailable: this.battleships.length > 0,
      torpCd: this.supervisor.isGodMode() || this.mode === "sandbox" ? 0 : this.bsTorpCd,
      cannonCd: this.supervisor.isGodMode() || this.mode === "sandbox" ? 0 : this.bsFireCd,
      missileCd: this.supervisor.isGodMode() || this.mode === "sandbox" ? 0 : this.bsMissileCd,
      freighterDist: this.battleships[0]
        ? Math.round(this.battleships[0].group.position.distanceTo(this.ship.group.position))
        : 0,
      battleshipCount: this.battleships.length,
      fleetBattle: this.fleetBattle,
      theatre: this.theatre,
      orbitalLaserMode: this.orbitalLaserMode,
      orbitalZoomFov: this.orbitalZoomFov,
    };
    this.cb.onHud(hud);
  }

  // ------------------------------------------------------------------ Aufräumen
  dispose() {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("pointerlockerror", this.onLockError);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointerdown", this.onFirstGesture);
    window.removeEventListener("keydown", this.onFirstGesture);
    this.resizeObs?.disconnect();
    this.input.detach();
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* ignore */
    }
    this.audio.dispose();
    try {
      this.effects.forEach((e) => e.dispose?.());
      this.pn?.dispose();
      this.pa?.dispose();
      this.ship?.dispose();
      this.renderer?.domElement.removeEventListener("webglcontextlost", this.lostHandler);
      this.renderer?.dispose();
      this.renderer?.forceContextLoss();
      this.renderer?.domElement.remove();
    } catch {
      /* ignore */
    }
  }
}
