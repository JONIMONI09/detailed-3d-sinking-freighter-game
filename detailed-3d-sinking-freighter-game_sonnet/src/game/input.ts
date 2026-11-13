export type Action =
  | "interact"
  | "reload"
  | "w1"
  | "w2"
  | "w3"
  | "w4"
  | "next"
  | "prev"
  | "last"
  | "flash"
  | "detonate"
  | "pause"
  | "jump"
  | "alt"
  | "status"
  | "terminal"
  | "lockdown"
  | "godmode"
  | "noclip"
  | "floodDial"
  | "switchShip"
  | "targetLock";

export class Input {
  keys = new Set<string>();
  held = new Set<string>(); // fire, sprint, crouch, jump (touch)
  private queue = new Set<Action>();
  lookX = 0;
  lookY = 0;
  touchLookX = 0;
  touchLookY = 0;
  moveX = 0; // touch joystick
  moveY = 0;
  mouseDown = false;
  dragLook = false;
  locked = false;
  private pad: { fire: boolean; alt: boolean; jump: boolean } = { fire: false, alt: false, jump: false };
  private padPrev: boolean[] = [];
  private target: HTMLElement | null = null;
  private handlers: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  attach(target: HTMLElement) {
    this.target = target;
    const on = (t: EventTarget, e: string, f: (ev: any) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(e, f as EventListener, o);
      this.handlers.push([t, e, f as EventListener, o]);
    };
    on(window, "keydown", (e: KeyboardEvent) => this.keyDown(e));
    on(window, "keyup", (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    });
    on(window, "blur", () => {
      this.keys.clear();
      this.held.clear();
      this.mouseDown = false;
    });
    on(document, "mousemove", (e: MouseEvent) => {
      if (this.locked) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      } else if (this.dragLook && this.mouseDown) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      }
    });
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.held.add("fire");
        console.log("[NORDWIND/INPUT] Mouse down (FIRE triggered)");
      } else if (e.button === 2) {
        this.queue.add("alt");
        console.log("[NORDWIND/INPUT] Mouse down (ALT/PLACE triggered)");
      }
    };
    on(target, "mousedown", handleMouseDown);
    on(window, "mouseup", (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.held.delete("fire");
      }
    });
    on(target, "contextmenu", (e: Event) => e.preventDefault());
    on(
      target,
      "wheel",
      (e: WheelEvent) => {
        if (e.deltaY > 0) this.queue.add("next");
        else if (e.deltaY < 0) this.queue.add("prev");
        e.preventDefault();
      },
      { passive: false },
    );
  }

  detach() {
    for (const [t, e, f, o] of this.handlers) t.removeEventListener(e, f, o);
    this.handlers = [];
    this.keys.clear();
    this.held.clear();
  }

  private keyDown(e: KeyboardEvent) {
    if (e.repeat) {
      if (["Space", "ArrowUp", "ArrowDown", "Tab"].includes(e.code)) e.preventDefault();
      return;
    }
    this.keys.add(e.code);
    const map: Record<string, Action> = {
      KeyE: "interact",
      KeyR: "reload",
      Digit1: "w1",
      Digit2: "w2",
      Digit3: "w3",
      Digit4: "w4",
      KeyQ: "last",
      KeyF: "flash",
      KeyG: "detonate",
      KeyB: "lockdown",
      KeyN: "noclip",
      Escape: "pause",
      KeyP: "pause",
      Space: "jump",
      Tab: "status",
      KeyT: "terminal",
      KeyV: "switchShip",
      KeyX: "targetLock",
    };
    const a = map[e.code];
    if (a) this.queue.add(a);
    if (e.code === "KeyG") this.queue.add("godmode");
    if (e.code === "KeyF") this.queue.add("floodDial");
    if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }

  press(a: Action) {
    this.queue.add(a);
  }
  pressed(a: Action): boolean {
    if (this.queue.has(a)) {
      this.queue.delete(a);
      return true;
    }
    return false;
  }
  clearQueue() {
    this.queue.clear();
  }
  setHeld(name: string, on: boolean) {
    if (on) this.held.add(name);
    else this.held.delete(name);
  }
  setMove(x: number, y: number) {
    this.moveX = x;
    this.moveY = y;
  }
  addLook(dx: number, dy: number) {
    this.lookX += dx;
    this.lookY += dy;
  }
  addTouchLook(dx: number, dy: number) {
    this.touchLookX += dx;
    this.touchLookY += dy;
  }
  consumeTouchLook(): [number, number] {
    const r: [number, number] = [this.touchLookX, this.touchLookY];
    this.touchLookX = 0;
    this.touchLookY = 0;
    return r;
  }
  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  get fire() {
    return this.held.has("fire") || this.pad.fire;
  }
  get sprint() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.held.has("sprint");
  }
  get crouch() {
    return this.keys.has("ControlLeft") || this.keys.has("KeyC") || this.held.has("crouch");
  }
  get jumpHeld() {
    return this.keys.has("Space") || this.held.has("jump") || this.pad.jump;
  }

  /** returns movement vector x (right), y (forward) */
  getMove(): [number, number] {
    let x = 0,
      y = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    x += this.moveX;
    y += this.moveY;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return [x, y];
  }

  pollGamepad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && Array.from(pads).find((p) => p && p.connected);
      if (!gp) {
        this.pad.fire = this.pad.alt = this.pad.jump = false;
        return;
      }
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      this.moveX = dz(gp.axes[0] || 0);
      this.moveY = -dz(gp.axes[1] || 0);
      this.lookX += dz(gp.axes[2] || 0) * 14;
      this.lookY += dz(gp.axes[3] || 0) * 14;
      const b = (i: number) => !!gp.buttons[i]?.pressed;
      this.pad.fire = b(7);
      this.pad.jump = b(0);
      const edge = (i: number, a: Action) => {
        const now = b(i);
        if (now && !this.padPrev[i]) this.queue.add(a);
        this.padPrev[i] = now;
      };
      edge(6, "alt");
      edge(2, "reload");
      edge(3, "interact");
      edge(5, "next");
      edge(4, "prev");
      edge(9, "pause");
      edge(1, "flash");
      edge(15, "detonate");
      this.setHeld("crouch", b(10));
      this.setHeld("sprint", b(11));
    } catch {
      /* ignore */
    }
  }

  get element() {
    return this.target;
  }
}
