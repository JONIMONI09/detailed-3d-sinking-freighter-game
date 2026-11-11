import * as THREE from "three";
import type { Weather } from "./settings";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Env {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  fogColor: THREE.Color;
  cloud: number;
  cloudColor: THREE.Color;
  night: number;
  storm: number;
  rain: number;
  waveMul: number;
  windMul: number;
  deep: THREE.Color;
  shallow: THREE.Color;
}

export function computeEnv(timeOfDay: number, weather: Weather): Env {
  const ang = ((timeOfDay - 6) / 12) * Math.PI;
  const elev = Math.sin(ang);
  const sunDir = new THREE.Vector3(Math.cos(ang) * 0.85, elev, 0.4).normalize();
  const day = smooth(-0.1, 0.3, elev);
  const dusk = Math.max(0, 1 - Math.abs(elev) * 3.5) * (elev > -0.25 ? 1 : 0);
  const storm = weather === "storm" ? 1 : weather === "cloudy" ? 0.35 : 0;
  const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

  const zenith = c(0.01, 0.015, 0.05).lerp(c(0.12, 0.33, 0.78), day);
  const horizon = c(0.03, 0.045, 0.1).lerp(c(0.6, 0.74, 0.9), day).lerp(c(1.0, 0.5, 0.25), dusk * 0.8);
  const grey = c(0.3, 0.33, 0.37).multiplyScalar(0.25 + 0.75 * day);
  zenith.lerp(grey, storm * 0.8);
  horizon.lerp(grey.clone().multiplyScalar(1.3), storm * 0.8);

  const sunColor = c(0.4, 0.5, 0.8).lerp(c(1, 0.94, 0.84), day).lerp(c(1, 0.5, 0.25), dusk * 0.7);
  const sunIntensity = (0.35 + 3.0 * day) * (1 - storm * 0.65);
  const sunDirOut = elev > -0.05 ? sunDir : new THREE.Vector3(-sunDir.x, Math.max(0.25, -sunDir.y), sunDir.z).normalize();

  const hemiSky = c(0.2, 0.25, 0.4).lerp(c(0.55, 0.7, 0.95), day).lerp(grey, storm * 0.6);
  const hemiGround = c(0.05, 0.06, 0.08).lerp(c(0.25, 0.28, 0.3), day);
  const hemiIntensity = (0.35 + 0.75 * day) * (1 - storm * 0.2);

  const fogColor = horizon.clone().lerp(zenith, 0.15);
  const cloudColor = c(0.1, 0.1, 0.14).lerp(c(1, 1, 1), day).lerp(c(1, 0.65, 0.5), dusk * 0.6).lerp(grey, storm * 0.6);

  const deep = c(0.01, 0.04, 0.07).lerp(c(0.015, 0.09, 0.15), day);
  const shallow = c(0.02, 0.1, 0.12).lerp(c(0.06, 0.32, 0.36), day);
  deep.lerp(c(0.02, 0.05, 0.06), storm * 0.5);

  return {
    sunDir: sunDirOut,
    sunColor,
    sunIntensity,
    hemiSky,
    hemiGround,
    hemiIntensity,
    zenith,
    horizon,
    fogColor,
    cloud: weather === "storm" ? 0.95 : weather === "cloudy" ? 0.62 : 0.32,
    cloudColor,
    night: 1 - smooth(-0.2, 0.05, elev),
    storm,
    rain: weather === "storm" ? 1 : 0,
    waveMul: weather === "storm" ? 1.9 : weather === "cloudy" ? 1.15 : 1,
    windMul: weather === "storm" ? 1 : weather === "cloudy" ? 0.5 : 0.2,
    deep,
    shallow,
  };
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform vec3 uHorizon;
uniform float uCloud; uniform vec3 uCloudColor; uniform float uNight; uniform float uTime; uniform float uStorm;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(7.1,3.3); a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y,0.,1.);
  vec3 col = mix(uHorizon, uZenith, pow(h,0.45));
  if (d.y < 0.0) col = mix(uHorizon, uHorizon*0.6, clamp(-d.y*5.,0.,1.));
  float sd = max(dot(d,uSunDir),0.);
  float vis = (1.0 - uStorm*0.85);
  col += uSunColor * (pow(sd,1500.)*10.0 + pow(sd,60.)*0.4 + pow(sd,6.)*0.12) * vis;
  if (uNight > 0.01 && d.y > 0.0) {
    vec3 sp = floor(d*260.);
    float r = hash3(sp);
    float tw = 0.6 + 0.4*sin(uTime*2.0 + r*60.0);
    col += vec3(step(0.9972, r)) * tw * uNight * smoothstep(0.0,0.25,d.y) * (1.0-uStorm);
  }
  if (d.y > 0.0) {
    vec2 uv = d.xz/(d.y+0.18)*0.8 + vec2(uTime*0.012, uTime*0.005);
    float n = fbm(uv*1.4);
    float n2 = fbm(uv*3.1 + 4.0);
    float cov = clamp(uCloud,0.,1.);
    float c = smoothstep(1.0-cov-0.02, 1.0-cov+0.25, n*0.8+n2*0.25);
    float shade = clamp(n2*1.3,0.,1.);
    vec3 cc = uCloudColor * mix(1.0, 0.45, shade*0.7 + uStorm*0.3);
    cc += uSunColor * pow(sd,8.0) * 0.25 * (1.0-uStorm);
    col = mix(col, cc, c * smoothstep(0.0, 0.18, d.y));
  }
  gl_FragColor = vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uCloud: { value: 0.4 },
        uCloudColor: { value: new THREE.Color(1, 1, 1) },
        uNight: { value: 0 },
        uTime: { value: 0 },
        uStorm: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }
  apply(env: Env) {
    const u = this.mat.uniforms;
    u.uSunDir.value.copy(env.sunDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uZenith.value.copy(env.zenith);
    u.uHorizon.value.copy(env.horizon);
    u.uCloud.value = env.cloud;
    u.uCloudColor.value.copy(env.cloudColor);
    u.uNight.value = env.night;
    u.uStorm.value = env.storm;
  }
  update(camPos: THREE.Vector3, t: number) {
    this.mesh.position.copy(camPos);
    this.mat.uniforms.uTime.value = t;
  }
}
