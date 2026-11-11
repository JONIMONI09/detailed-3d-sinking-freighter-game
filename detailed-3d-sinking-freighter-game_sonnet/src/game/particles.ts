import * as THREE from "three";

const vert = /* glsl */ `
attribute vec4 aColor; attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 400.0);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
varying vec4 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c)*2.0;
  float a = smoothstep(1.0, 0.15, d) * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ParticleSystem {
  points: THREE.Points;
  cap: number;
  n = 0;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private base: Float32Array; // r g b a
  private grav: Float32Array;
  private drag: Float32Array;
  private mat: THREE.ShaderMaterial;
  private geo: THREE.BufferGeometry;
  density = 1;

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.base = new Float32Array(cap * 4);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.pos, 3);
    const ca = new THREE.BufferAttribute(this.col, 4);
    const sa = new THREE.BufferAttribute(this.size, 1);
    pa.setUsage(THREE.DynamicDrawUsage);
    ca.setUsage(THREE.DynamicDrawUsage);
    sa.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", pa);
    this.geo.setAttribute("aColor", ca);
    this.geo.setAttribute("aSize", sa);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      fog: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
  }

  setScale(s: number) {
    this.mat.uniforms.uScale.value = s;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, grav = 0, drag = 0) {
    if (this.density < 1 && Math.random() > this.density) return;
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.base[i * 4] = r;
    this.base[i * 4 + 1] = g;
    this.base[i * 4 + 2] = b;
    this.base[i * 4 + 3] = a;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) this.copy(l, i);
        continue;
      }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
      this.col[i * 4] = this.base[i * 4];
      this.col[i * 4 + 1] = this.base[i * 4 + 1];
      this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * fade;
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  private copy(from: number, to: number) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
    }
    for (let k = 0; k < 4; k++) {
      this.col[to * 4 + k] = this.col[from * 4 + k];
      this.base[to * 4 + k] = this.base[from * 4 + k];
    }
    this.size[to] = this.size[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
  }

  clear() {
    this.n = 0;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Regen: Linien, vollständig im Vertex-Shader animiert */
export function createRain(count: number): THREE.LineSegments {
  const pos = new Float32Array(count * 6);
  const rnd = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 60,
      y = Math.random() * 40,
      z = (Math.random() - 0.5) * 60;
    pos.set([x, y, z, x, y + 1, z], i * 6);
    rnd[i * 2] = rnd[i * 2 + 1] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aEnd", new THREE.BufferAttribute(new Float32Array(count * 2).map((_, i) => i % 2), 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0.35 } },
    vertexShader: /* glsl */ `
      attribute float aEnd; uniform float uTime; uniform vec3 uCam; varying float vA;
      void main(){
        vec3 p = position;
        float fall = uTime * 28.0 + p.x*3.1 + p.z*1.7;
        p.y = mod(p.y - fall, 40.0);
        p.x += (1.0-aEnd)*0.0 + aEnd*0.6;
        vec3 w = vec3(p.x + floor((uCam.x-p.x)/60.0+0.5)*60.0, p.y + uCam.y - 20.0, p.z + floor((uCam.z-p.z)/60.0+0.5)*60.0);
        w.y -= aEnd*0.9;
        vA = 1.0 - aEnd*0.7;
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; varying float vA;
      void main(){ gl_FragColor = vec4(0.75,0.82,0.9,uAlpha*vA); }`,
  });
  const l = new THREE.LineSegments(g, m);
  l.frustumCulled = false;
  l.renderOrder = 12;
  return l;
}
