import * as THREE from "three";

let aniso = 4;
export function setAnisotropy(a: number) {
  aniso = a;
}

type Draw = (c: CanvasRenderingContext2D, s: number) => void;

function rnd(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(size: number, draw: Draw, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(c: CanvasRenderingContext2D, s: number, amount: number, seed: number, bright = true) {
  const r = rnd(seed);
  const img = c.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
    if (!bright) img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

export interface TexSet {
  steel: THREE.Texture;
  deck: THREE.Texture;
  wall: THREE.Texture;
  hull: THREE.Texture;
  container: THREE.Texture;
  wood: THREE.Texture;
  carpet: THREE.Texture;
  tile: THREE.Texture;
  rust: THREE.Texture;
  grate: THREE.Texture;
  glow: THREE.Texture;
}

export function createTextures(size = 256): TexSet {
  const steel = make(size, (c, s) => {
    c.fillStyle = "#8a9096";
    c.fillRect(0, 0, s, s);
    noise(c, s, 26, 11);
    c.strokeStyle = "rgba(20,22,26,0.55)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, s - 2, s - 2);
    c.strokeStyle = "rgba(255,255,255,0.12)";
    c.strokeRect(4, 4, s - 8, s - 8);
    c.fillStyle = "rgba(30,30,34,0.7)";
    for (let i = 0; i < 4; i++)
      for (const [x, y] of [
        [10, 10],
        [s - 10, 10],
        [10, s - 10],
        [s - 10, s - 10],
      ]) {
        c.beginPath();
        c.arc(x + (i === 9 ? 1 : 0), y, 2.2, 0, 7);
        c.fill();
        break;
      }
    const r = rnd(5);
    c.strokeStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < 25; i++) {
      const x = r() * s,
        y = r() * s;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 50);
      c.stroke();
    }
  });

  const deck = make(size, (c, s) => {
    c.fillStyle = "#3d5a46";
    c.fillRect(0, 0, s, s);
    noise(c, s, 22, 21);
    c.strokeStyle = "rgba(255,255,255,0.12)";
    c.lineWidth = 2;
    const step = s / 8;
    for (let i = -8; i < 16; i++) {
      c.beginPath();
      c.moveTo(i * step, 0);
      c.lineTo(i * step + s, s);
      c.stroke();
      c.beginPath();
      c.moveTo(i * step, s);
      c.lineTo(i * step + s, 0);
      c.stroke();
    }
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.strokeRect(0, 0, s, s);
    const r = rnd(2);
    for (let i = 0; i < 30; i++) {
      c.fillStyle = `rgba(120,70,40,${r() * 0.25})`;
      c.beginPath();
      c.arc(r() * s, r() * s, 2 + r() * 8, 0, 7);
      c.fill();
    }
  });

  const wall = make(size, (c, s) => {
    c.fillStyle = "#d9d6cc";
    c.fillRect(0, 0, s, s);
    noise(c, s, 14, 31);
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "rgba(0,0,0,0.0)");
    g.addColorStop(1, "rgba(60,50,30,0.18)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, s - 3, s, 3);
    c.fillRect(s / 2 - 1, 0, 2, s);
  });

  const hull = make(size, (c, s) => {
    c.fillStyle = "#2d3036";
    c.fillRect(0, 0, s, s);
    noise(c, s, 20, 41);
    const r = rnd(8);
    for (let i = 0; i < 40; i++) {
      const x = r() * s;
      const g = c.createLinearGradient(x, 0, x, s * (0.3 + r() * 0.7));
      g.addColorStop(0, "rgba(130,70,30,0.35)");
      g.addColorStop(1, "rgba(130,70,30,0)");
      c.fillStyle = g;
      c.fillRect(x, 0, 2 + r() * 4, s);
    }
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 2;
    c.strokeRect(0, 0, s, s);
    c.fillStyle = "rgba(0,0,0,0.5)";
    for (let y = 8; y < s; y += 16) for (let x = 8; x < s; x += 16) c.fillRect(x, y, 2, 2);
  });

  const container = make(size, (c, s) => {
    c.fillStyle = "#cfcfcf";
    c.fillRect(0, 0, s, s);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * s;
      const g = c.createLinearGradient(x, 0, x + s / n, 0);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(0.5, "rgba(0,0,0,0.0)");
      g.addColorStop(1, "rgba(0,0,0,0.38)");
      c.fillStyle = g;
      c.fillRect(x, 0, s / n, s);
    }
    noise(c, s, 18, 51);
    const r = rnd(9);
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(110,60,30,${r() * 0.3})`;
      c.fillRect(r() * s, r() * s, 3 + r() * 14, 6 + r() * 30);
    }
    c.fillStyle = "rgba(0,0,0,0.5)";
    c.fillRect(0, 0, s, 4);
    c.fillRect(0, s - 4, s, 4);
  });

  const wood = make(size, (c, s) => {
    c.fillStyle = "#7a5a3a";
    c.fillRect(0, 0, s, s);
    const r = rnd(61);
    const plank = s / 4;
    for (let i = 0; i < 4; i++) {
      c.fillStyle = `rgb(${110 + r() * 30},${80 + r() * 20},${50 + r() * 15})`;
      c.fillRect(0, i * plank, s, plank - 2);
      for (let k = 0; k < 14; k++) {
        c.strokeStyle = `rgba(40,25,10,${0.1 + r() * 0.15})`;
        c.beginPath();
        const y = i * plank + r() * plank;
        c.moveTo(0, y);
        c.bezierCurveTo(s * 0.3, y + r() * 4, s * 0.6, y - r() * 4, s, y);
        c.stroke();
      }
    }
    c.fillStyle = "rgba(0,0,0,0.5)";
    for (let i = 0; i < 4; i++) c.fillRect(0, i * plank + plank - 2, s, 2);
  });

  const carpet = make(size, (c, s) => {
    c.fillStyle = "#4a5568";
    c.fillRect(0, 0, s, s);
    noise(c, s, 40, 71);
    c.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < s; i += 8) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, s);
      c.stroke();
    }
  });

  const tile = make(size, (c, s) => {
    c.fillStyle = "#b8bcc0";
    c.fillRect(0, 0, s, s);
    c.fillStyle = "#9fa4a8";
    c.fillRect(0, 0, s / 2, s / 2);
    c.fillRect(s / 2, s / 2, s / 2, s / 2);
    noise(c, s, 14, 81);
    c.strokeStyle = "rgba(0,0,0,0.3)";
    c.lineWidth = 2;
    c.strokeRect(0, 0, s, s);
    c.beginPath();
    c.moveTo(s / 2, 0);
    c.lineTo(s / 2, s);
    c.moveTo(0, s / 2);
    c.lineTo(s, s / 2);
    c.stroke();
  });

  const rust = make(size, (c, s) => {
    c.fillStyle = "#6b4a36";
    c.fillRect(0, 0, s, s);
    noise(c, s, 50, 91);
    const r = rnd(3);
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(${140 + r() * 60},${70 + r() * 30},30,${r() * 0.35})`;
      c.beginPath();
      c.arc(r() * s, r() * s, 3 + r() * 18, 0, 7);
      c.fill();
    }
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.strokeRect(0, 0, s, s);
  });

  const grate = make(size, (c, s) => {
    c.fillStyle = "#26292d";
    c.fillRect(0, 0, s, s);
    c.strokeStyle = "#6c737b";
    c.lineWidth = 3;
    const n = 8;
    for (let i = 0; i <= n; i++) {
      c.beginPath();
      c.moveTo((i * s) / n, 0);
      c.lineTo((i * s) / n, s);
      c.moveTo(0, (i * s) / n);
      c.lineTo(s, (i * s) / n);
      c.stroke();
    }
  });

  const glow = make(
    64,
    (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,255,255,0.6)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    },
    false,
  );

  return { steel, deck, wall, hull, container, wood, carpet, tile, rust, grate, glow };
}

export function textTexture(text: string, w: number, h: number, bg: string | null, fg: string, font?: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  if (bg) {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
  }
  c.fillStyle = fg;
  c.font = font || `bold ${Math.floor(h * 0.6)}px Arial, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const lines = text.split("\n");
  lines.forEach((l, i) => c.fillText(l, w / 2, (h * (i + 0.5 + (lines.length > 1 ? 0 : 0))) / lines.length));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
