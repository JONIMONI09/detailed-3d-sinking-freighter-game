import type { Body, CollisionWorld } from "./physics";
import type { Input } from "./input";

export interface PlayerCtx {
  world: CollisionWorld;
  slide: [number, number];
  /** lokale Wasserhöhe an (x,y,z) oder -Infinity */
  water: (x: number, y: number, z: number) => number;
  sens: number;
  touchSens: number;
  invertY: boolean;
}

export interface PlayerEvents {
  step: boolean;
  landed: number;
  jumped: boolean;
}

export class Player {
  body: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.34, h: 1.75, onGround: false, step: 0.5 };
  yaw = 0;
  pitch = 0;
  crouch = 0; // 0..1
  health = 100;
  armor = 0;
  oxygen = 1;
  alive = true;
  speed = 0;
  bob = 0;
  stepAcc = 0;
  swimming = false;
  wading = false;
  submerged = false;
  sprinting = false;
  lastVy = 0;
  private jumpBuf = 0;
  private wasGround = false;
  eyeH = 1.62;
  waterLevel = -Infinity;

  teleport(x: number, y: number, z: number, yaw: number) {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = b.vy = b.vz = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
  }

  eye(): [number, number, number] {
    const h = 1.62 - this.crouch * 0.62;
    return [this.body.x, this.body.y + h, this.body.z];
  }

  update(dt: number, input: Input, ctx: PlayerCtx, controls: boolean): PlayerEvents {
    const ev: PlayerEvents = { step: false, landed: 0, jumped: false };
    const b = this.body;
    // --- Blick
    const [lx, ly] = input.consumeLook();
    const [tx, ty] = input.consumeTouchLook();
    if (controls) {
      const k = 0.0022 * ctx.sens;
      const kt = 0.0045 * ctx.touchSens;
      this.yaw -= lx * k + tx * kt;
      const inv = ctx.invertY ? -1 : 1;
      this.pitch -= (ly * k + ty * kt) * inv;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    }
    if (this.yaw > Math.PI * 2 || this.yaw < -Math.PI * 2) this.yaw %= Math.PI * 2;

    // --- Wasser
    const eyeY = b.y + 1.62 - this.crouch * 0.62;
    this.waterLevel = Math.max(ctx.water(b.x, eyeY, b.z), ctx.water(b.x, b.y + 0.3, b.z));
    this.submerged = eyeY < this.waterLevel;
    this.wading = b.y + 0.35 < this.waterLevel;
    this.swimming = this.submerged || (this.wading && b.y + 1.0 < this.waterLevel);

    // --- Ducken
    const wantCrouch = controls && input.crouch && !this.swimming;
    const target = wantCrouch ? 1 : 0;
    if (target > this.crouch) this.crouch = Math.min(1, this.crouch + dt * 6);
    else if (target < this.crouch) {
      const newH = 1.75 - (this.crouch - dt * 6) * 0.65;
      if (!ctx.world.overlaps(b.x, b.y + 0.05, b.z, b.r * 0.95, Math.max(newH, 1.1) - 0.05)) this.crouch = Math.max(0, this.crouch - dt * 6);
    }
    b.h = 1.75 - this.crouch * 0.65;

    // --- Bewegung
    let [mx, my] = controls ? input.getMove() : [0, 0];
    const fwdX = -Math.sin(this.yaw),
      fwdZ = -Math.cos(this.yaw);
    const rgtX = Math.cos(this.yaw),
      rgtZ = -Math.sin(this.yaw);
    this.sprinting = controls && input.sprint && my > 0.3 && !this.swimming && this.crouch < 0.3;
    let speed = this.sprinting ? 6.2 : this.crouch > 0.5 ? 1.9 : 3.7;
    if (this.swimming) speed = 2.4;
    else if (this.wading) speed *= 0.72;
    const wishX = (fwdX * my + rgtX * mx) * speed;
    const wishZ = (fwdZ * my + rgtZ * mx) * speed;
    const acc = this.swimming ? 6 : b.onGround ? 45 : 5;
    const k = Math.min(1, acc * dt);
    b.vx += (wishX - b.vx) * k;
    b.vz += (wishZ - b.vz) * k;

    // Rutschen durch Schiffsneigung
    const sl = Math.hypot(ctx.slide[0], ctx.slide[1]);
    if (sl > 1.1 && !this.swimming) {
      const f = b.onGround ? 1.0 : 0.3;
      b.vx += ctx.slide[0] * 0.9 * dt * f;
      b.vz += ctx.slide[1] * 0.9 * dt * f;
    }

    // Springen
    if (controls && input.pressed("jump")) this.jumpBuf = 0.15;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.swimming) {
      let vyT = -0.4;
      if (controls && input.jumpHeld) vyT = 2.6;
      else if (controls && input.crouch) vyT = -2.6;
      b.vy += (vyT - b.vy) * Math.min(1, 4 * dt);
    } else {
      b.vy -= 18 * dt;
      if (b.vy < -40) b.vy = -40;
      if (this.jumpBuf > 0 && b.onGround && this.crouch < 0.5) {
        b.vy = 6.0;
        this.jumpBuf = 0;
        ev.jumped = true;
        b.onGround = false;
      }
    }
    const vyBefore = b.vy;

    // Integration in kleinen Schritten
    const dx = b.vx * dt,
      dy = b.vy * dt,
      dz = b.vz * dt;
    const maxC = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.min(16, Math.max(1, Math.ceil(maxC / 0.12)));
    const px = b.x,
      pz = b.z;
    for (let i = 0; i < steps; i++) {
      ctx.world.move(b, dx / steps, dy / steps, dz / steps);
    }
    // gemessene Geschwindigkeit
    const moved = Math.hypot(b.x - px, b.z - pz);
    this.speed = moved / Math.max(dt, 1e-4);

    // Landung
    if (b.onGround && !this.wasGround && vyBefore < -3) {
      ev.landed = vyBefore;
    }
    this.wasGround = b.onGround;
    this.lastVy = vyBefore;

    // Schritte & Kopfwippen
    if (b.onGround && this.speed > 0.6 && !this.swimming) {
      const stride = this.sprinting ? 1.9 : this.crouch > 0.5 ? 1.0 : 1.45;
      this.stepAcc += moved;
      this.bob += moved * 2.4;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        ev.step = true;
      }
    } else if (this.swimming && this.speed > 0.5) {
      this.stepAcc += moved;
      this.bob += moved * 1.2;
      if (this.stepAcc > 1.8) {
        this.stepAcc = 0;
        ev.step = true;
      }
    }
    return ev;
  }
}
