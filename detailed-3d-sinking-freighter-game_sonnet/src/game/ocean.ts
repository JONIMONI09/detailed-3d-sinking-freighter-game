import * as THREE from "three";
import type { Env } from "./environment";

// Wellen: gleiche Daten für Shader (GPU) und Schiffsbewegung (CPU)
const LAMBDA = [62, 37, 21, 13, 7.5, 4.3];
const AMP = [0.85, 0.5, 0.28, 0.14, 0.07, 0.035];
const ANGLE = [0.2, 0.9, -0.6, 1.7, -1.3, 2.5];
const PHASE = [0.3, 1.7, 4.1, 2.2, 5.5, 0.9];
const G = 9.81;
const WAVES = LAMBDA.map((l, i) => {
  const k = (2 * Math.PI) / l;
  return { k, w: Math.sqrt(G * k), a: AMP[i], dx: Math.cos(ANGLE[i]), dz: Math.sin(ANGLE[i]), ph: PHASE[i] };
});

export function oceanHeight(x: number, z: number, t: number, amp: number): number {
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph);
  }
  return h * amp;
}

const f = (n: number) => n.toFixed(5);
let waveGLSL = "";
WAVES.forEach((w) => {
  waveGLSL += `ph = ${f(w.k)}*(${f(w.dx)}*p.x+${f(w.dz)}*p.y) - ${f(w.w)}*uTime + ${f(w.ph)};
  h += ${f(w.a)}*sin(ph); g += ${f(w.a * w.k)}*cos(ph)*vec2(${f(w.dx)},${f(w.dz)});\n`;
});

const vert = /* glsl */ `
uniform float uTime; uniform float uAmp;
varying vec3 vWorld; varying float vH; varying vec2 vG;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  vec2 p = wp.xz; float h=0.; vec2 g=vec2(0.); float ph;
  ${waveGLSL}
  h*=uAmp; g*=uAmp;
  wp.y += h;
  vWorld = wp.xyz; vH = h; vG = g;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uHorizon; uniform vec3 uZenith;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFogColor; uniform float uFog;
uniform float uTime; uniform float uAmp; uniform float uStorm; uniform float uUnder;
uniform mat4 uShipInv; uniform float uShipOn; uniform vec3 uUnderColor;
varying vec3 vWorld; varying float vH; varying vec2 vG;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float hullW(float z){
  if (z < -70.0 || z > 70.0) return 0.0;
  if (z < 52.0) return 11.0;
  float t = (z-52.0)/18.0;
  return 11.0*pow(max(1.0-t*t,0.0),0.55);
}
void main(){
  float foamHull = 0.0;
  if (uShipOn > 0.5) {
    vec3 lp = (uShipInv * vec4(vWorld,1.0)).xyz;
    float wf = 1.0 - 0.5*smoothstep(-3.5,-6.5,lp.y);
    float hw = hullW(lp.z)*wf;
    if (lp.y < 2.95 && lp.y > -7.0 && lp.z > -70.0 && abs(lp.x) < hw - 0.12) discard;
    float dd = abs(lp.x) - hw;
    float rng = step(-70.0, lp.z) * step(lp.z, 72.0);
    float nz = noise(vWorld.xz*1.3 + uTime*0.6);
    foamHull = smoothstep(2.6,0.0,dd) * rng * step(lp.y,3.0) * (0.45+0.55*nz) * step(0.0, dd + 0.2);
  }
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec3 N = normalize(vec3(-vG.x, 1.0, -vG.y));
  vec2 dn = vec2(noise(vWorld.xz*0.9+uTime*0.3), noise(vWorld.xz*0.9-uTime*0.25+9.0))-0.5;
  N = normalize(N + vec3(dn.x,0.,dn.y)*0.12*(1.0+uStorm));
  vec3 col;
  if (!gl_FrontFacing || uUnder > 0.5) {
    float up = max(dot(-N, V), 0.0);
    col = uUnderColor * (0.55 + 0.6*pow(1.0-up,2.0));
  } else {
    float F = 0.02 + 0.98*pow(1.0 - max(dot(N,V),0.0), 5.0);
    vec3 R = reflect(-V,N); R.y = abs(R.y);
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y,0.,1.),0.45));
    float sp = pow(max(dot(R,uSunDir),0.0), 700.0)*6.0 + pow(max(dot(R,uSunDir),0.0), 60.0)*0.35;
    float depthMix = clamp(0.5 + vH/(1.6*max(uAmp,0.2)) + dn.x*0.4, 0.0, 1.0);
    vec3 body = mix(uDeep, uShallow, depthMix*0.7);
    col = mix(body, sky, F) + uSunColor*sp*(1.0-uStorm*0.8);
    float crest = smoothstep(0.55*uAmp+0.1, 1.15*uAmp+0.25, vH + noise(vWorld.xz*0.7+uTime*0.2)*0.35*uAmp);
    float fn = noise(vWorld.xz*2.6 + uTime*0.4);
    float foam = clamp(crest*(0.5+fn) * (0.5+uStorm*0.8) + foamHull*0.9, 0.0, 1.0);
    col = mix(col, vec3(0.92,0.96,1.0)*(0.35+0.65*length(uSunColor)*0.6), foam*0.85);
  }
  float fg = 1.0 - exp(-pow(dist*uFog, 2.0));
  col = mix(col, uFogColor, clamp(fg,0.,1.));
  gl_FragColor = vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Ocean {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  quality = -1;
  amp = 1;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 1 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFog: { value: 0.001 },
        uStorm: { value: 0 },
        uUnder: { value: 0 },
        uShipInv: { value: new THREE.Matrix4() },
        uShipOn: { value: 1 },
        uUnderColor: { value: new THREE.Color(0.02, 0.18, 0.25) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.setQuality(1);
  }

  setQuality(q: number) {
    if (q === this.quality) return;
    this.quality = q;
    const rings = [70, 110, 160][q] ?? 110;
    const segs = [72, 110, 160][q] ?? 110;
    const r0 = 1.5,
      r1 = 2600;
    const pos: number[] = [];
    const idx: number[] = [];
    pos.push(0, 0, 0);
    for (let i = 0; i <= rings; i++) {
      const r = r0 * Math.pow(r1 / r0, i / rings) - r0 * (i === 0 ? 1 : 0.0);
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = 1 + i * segs + j,
          b = 1 + i * segs + ((j + 1) % segs),
          c = 1 + (i + 1) * segs + j,
          d = 1 + (i + 1) * segs + ((j + 1) % segs);
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  apply(env: Env, fogDensity: number, ampScale: number) {
    const u = this.mat.uniforms;
    u.uSunDir.value.copy(env.sunDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uHorizon.value.copy(env.horizon);
    u.uZenith.value.copy(env.zenith);
    u.uDeep.value.copy(env.deep);
    u.uShallow.value.copy(env.shallow);
    u.uFogColor.value.copy(env.fogColor);
    u.uFog.value = fogDensity;
    u.uStorm.value = env.storm;
    this.amp = ampScale * env.waveMul;
    u.uAmp.value = this.amp;
    u.uUnderColor.value.copy(env.deep).lerp(new THREE.Color(0.03, 0.3, 0.38), 0.5);
  }

  height(x: number, z: number, t: number) {
    return oceanHeight(x, z, t, this.amp);
  }

  update(camPos: THREE.Vector3, t: number, shipInv: THREE.Matrix4, shipOn: boolean, under: boolean) {
    this.mesh.position.set(camPos.x, 0, camPos.z);
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uShipInv.value.copy(shipInv);
    u.uShipOn.value = shipOn ? 1 : 0;
    u.uUnder.value = under ? 1 : 0;
  }
}
