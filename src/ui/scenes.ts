/*
 * Painted plates. Each scene draws a greyscale picture (white is lit) with the ordinary canvas API,
 * plus an accent mask on a second canvas; the Artwork component then crushes both through the Bayer
 * matrix into two or three inks, the way old 1-bit illustrations were printed. Scenes are drawn at
 * their native size (a few hundred pixels across at most) and scaled up with crisp edges.
 */
type G = CanvasRenderingContext2D;

export interface Scene {
  w: number;
  h: number;
  /** Draw one frame. `g` is luminance, `a` is the accent mask (white where the accent ink goes). */
  draw: (g: G, a: G, t: number) => void;
}

const W = 180;
const H = 96;
const TAU = Math.PI * 2;
const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const hash = (x: number, y: number, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (f: number) => f * f * (3 - 2 * f);
function noise(x: number, y: number, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x: number, y: number, s = 0) => noise(x, y, s) * 0.5 + noise(x * 2.1, y * 2.1, s + 1) * 0.3 + noise(x * 4.3, y * 4.3, s + 2) * 0.2;
const gray = (v: number) => { const c = Math.round(cl(v) * 255); return `rgb(${c},${c},${c})`; };

/** Set every pixel from a function of its position (and what is already there). Null leaves it alone. */
function field(g: G, fn: (x: number, y: number, prev: number) => number | null) {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const v = fn(x, y, d[i] / 255);
    if (v !== null) d[i] = d[i + 1] = d[i + 2] = cl(v) * 255;
  }
  g.putImageData(img, 0, 0);
}

function shape(g: G, v: number, pts: number[]) {
  g.fillStyle = gray(v);
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}
function disc(g: G, x: number, y: number, r: number, v: number) {
  g.fillStyle = gray(v);
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}
function ring(g: G, x: number, y: number, r: number, v: number, lw = 1) {
  g.strokeStyle = gray(v);
  g.lineWidth = lw;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.stroke();
}
function line(g: G, x0: number, y0: number, x1: number, y1: number, v: number, lw = 1) {
  g.strokeStyle = gray(v);
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
function rect(g: G, x: number, y: number, w: number, h: number, v: number) {
  g.fillStyle = gray(v);
  g.fillRect(x, y, w, h);
}
/** Light added on top of whatever is there. */
function glow(g: G, x: number, y: number, r: number, v: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, gray(v));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = op;
}
function pine(g: G, x: number, base: number, h: number, v: number, tip?: number) {
  for (let k = 0; k < 3; k++) {
    const top = base - h + k * h * 0.22, bot = base - h * 0.32 * (2 - k), half = h * (0.18 + k * 0.08);
    shape(g, v, [x, top, x - half, bot, x + half, bot]);
    if (tip !== undefined) shape(g, tip, [x, top, x - half * 0.3, top + h * 0.1, x + half * 0.3, top + h * 0.1]);
  }
  rect(g, x - 0.5, base - h * 0.2, 1, h * 0.2, v);
}
/** Snow (or ash) drifting down. Negative speed makes it rise. */
function flakes(g: G, t: number, n: number, v: number, seed: number, speed = 6, w = W, h = H) {
  g.fillStyle = gray(v);
  for (let i = 0; i < n; i++) {
    const sp = speed * (0.5 + hash(i, 1, seed));
    const x = (((hash(i, 0, seed) * w + Math.sin(t * 0.7 + i) * 3 + t * 1.5) % w) + w) % w;
    const y = (((hash(i, 2, seed) * h + t * sp) % h) + h) % h;
    const s = hash(i, 3, seed) < 0.2 ? 2 : 1;
    g.fillRect(Math.floor(x), Math.floor(y), s, s);
  }
}
const flicker = (t: number, k = 0) => 0.75 + 0.15 * Math.sin(t * 9.1 + k) + 0.1 * Math.sin(t * 23.7 + k * 3);

// ---------------------------------------------------------------- zone 1: Shallow Bore

/** A derrick in grey fog over a snowfield, one lamp lit, someone standing too far from it. */
const bore: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const HZ = 58;
    field(g, (x, y) => {
      if (y < HZ) {
        let v = 0.26 + 0.22 * (y / HZ) + 0.1 * (fbm(x / 28 + t * 0.04, y / 10, 3) - 0.5);
        const d = Math.hypot(x - 132, y - 22);
        v += 0.3 * Math.max(0, 1 - d / 34) ** 2;
        if (d < 6) v = 0.9;
        return v;
      }
      const k = (y - HZ) / (H - HZ);
      return 0.58 + 0.22 * k + 0.06 * Math.sin(x * 0.09 + y * 0.6 + Math.sin(x * 0.03) * 4) + 0.05 * (hash(x, y) - 0.5);
    });
    for (let i = 0; i < 44; i++) pine(g, hash(i, 9) * W, HZ + 1, 5 + hash(i, 8) * 9, 0.2);

    // the derrick
    const legX = (y: number, side: number) => (side < 0 ? 40 + ((80 - y) / 66) * 10 : 64 - ((80 - y) / 66) * 10);
    line(g, 40, 80, 50, 14, 0.03, 1.5);
    line(g, 64, 80, 54, 14, 0.03, 1.5);
    for (let k = 0; k < 6; k++) {
      const y0 = 80 - k * 11, y1 = y0 - 11;
      line(g, legX(y0, -1), y0, legX(y1, 1), y1, 0.05, 0.8);
      line(g, legX(y0, 1), y0, legX(y1, -1), y1, 0.05, 0.8);
      line(g, legX(y1, -1), y1, legX(y1, 1), y1, 0.05, 0.8);
    }
    rect(g, 46, 11, 12, 3, 0.03);
    line(g, 52, 13, 52, 79, 0.12, 0.7);
    // a shed at its foot
    rect(g, 24, 70, 15, 11, 0.07);
    shape(g, 0.05, [22, 70, 31.5, 64, 41, 70]);
    // the hole
    g.fillStyle = gray(0);
    g.beginPath();
    g.ellipse(52, 81, 10, 2.5, 0, 0, TAU);
    g.fill();
    // the lamp
    const f = flicker(t);
    disc(a, 52, 12.5, 1.4, 1);
    glow(a, 52, 12.5, 7, 0.55 * f);
    glow(g, 52, 12.5, 14, 0.25 * f);
    rect(a, 31, 74, 2, 2, f > 0.8 ? 1 : 0.5);

    // someone, and their footprints
    g.fillStyle = gray(0.42);
    g.beginPath();
    g.ellipse(121, 85.5, 5, 1, 0, 0, TAU);
    g.fill();
    shape(g, 0.03, [116, 85, 117, 77, 119, 75, 121, 77, 122, 85]);
    disc(g, 119, 73.6, 1.7, 0.03);
    for (let k = 0; k < 14; k++) rect(g, 125 + k * 4 + (k % 2), 86 + k * 0.7 + (k % 2), 1, 1, 0.4);

    flakes(g, t, 90, 0.02, 1, 7);
  },
};

// ---------------------------------------------------------------- zone 2: Conduit

/** Looking down the pipe. The ribs come toward you; far off, a red light, and something standing in the water. */
const conduit: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const cx = 90, cy = 44;
    field(g, (x, y) => {
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy * 1.15);
      if (r < 4) return 0;
      const z = 60 / r;
      const rib = (((z * 1.2 - t * 0.6) % 1) + 1) % 1;
      const ribK = cl(1.4 - z * 0.12);
      const light = 0.6 + 0.4 * Math.cos(Math.atan2(dy, dx) + Math.PI / 2);
      let v = (0.95 / (0.6 + z)) * light * (1 + (rib < 0.14 ? 0.35 : -0.2) * ribK);
      v += 0.05 * (hash(x, y) - 0.5);
      if (dy > 0 && dy * 1.15 > r * 0.62 && r > 9) {
        v = v * 0.4 + 0.1 + 0.12 * Math.sin(x * 0.5 + Math.sin(y * 0.8 + t * 2) * 1.5) * (dy / 50);
      }
      return v;
    });
    // pipes along the walls, running off to the vanishing point
    for (const [x0, y0, lw] of [[0, 8, 3.5], [0, 22, 2], [180, 12, 3.5], [180, 26, 2]] as const) {
      const x1 = x0 + (cx - x0) * 0.86, y1 = y0 + (cy - y0) * 0.86;
      for (const [off, hi] of [[lw * 0.6, 0.12], [0, 0.8]] as const) {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, gray(hi));
        gr.addColorStop(1, gray(0.04));
        g.strokeStyle = gr;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x0, y0 + off);
        g.lineTo(x1, y1 + off * 0.15);
        g.stroke();
      }
    }
    // drips
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.6 + hash(i, 5)) % 1;
      rect(g, 30 + i * 24, 3 + p * p * 60, 1, 2, 0.85 * (1 - p));
    }
    // the light at the end, and who stands under it
    disc(a, cx, cy, 1.2, Math.sin(t * 3) > 0 ? 1 : 0.35);
    if (Math.sin(t * 0.21) > 0.2) shape(g, 0, [89, 54, 89.4, 48.5, 90.6, 48.5, 91, 54]);
  },
};

// ---------------------------------------------------------------- zone 3: Pattern Buffer

const BUST = 'M118 96C116 86 112 80 112 74C122 68 128 52 124 36C120 18 104 8 88 10C76 11 70 18 69 27L68 33C66 35 62 41 60 45L62 47L66 48C66 51 64 52 66 53C64 55 66 57 67 57C66 61 68 64 72 65C78 66 84 64 88 64C88 70 86 76 84 80C70 84 56 90 48 96Z';

/** A marble head played back off tape: a band of interference rolls through it, and the face comes back wrong. */
const buffer: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    field(g, (x, y) => 0.1 + 0.06 * (y / H) + 0.04 * (hash(x >> 2, y >> 2) - 0.5));
    rect(g, 54, 3, 92, 93, 0.22);
    rect(g, 58, 7, 84, 89, 0.11);
    const hg = g.createRadialGradient(98, 42, 0, 98, 42, 40);
    hg.addColorStop(0, gray(0.5));
    hg.addColorStop(1, gray(0.13));
    g.fillStyle = hg;
    g.beginPath();
    g.arc(98, 42, 40, 0, TAU);
    g.fill();

    const p = new Path2D(BUST);
    const lg = g.createLinearGradient(58, 0, 128, 0);
    lg.addColorStop(0, gray(0.95));
    lg.addColorStop(0.45, gray(0.62));
    lg.addColorStop(1, gray(0.16));
    g.fillStyle = lg;
    g.fill(p);
    g.save();
    g.clip(p);
    g.globalCompositeOperation = 'multiply';
    const sg = g.createRadialGradient(94, 76, 2, 94, 76, 22);
    sg.addColorStop(0, gray(0.3));
    sg.addColorStop(1, gray(1));
    g.fillStyle = sg;
    g.fillRect(60, 50, 70, 46);
    const eg = g.createRadialGradient(76, 33, 0, 76, 33, 6);
    eg.addColorStop(0, gray(0.4));
    eg.addColorStop(1, gray(1));
    g.fillStyle = eg;
    g.fillRect(68, 26, 16, 14);
    g.globalCompositeOperation = 'source-over';
    line(g, 72.5, 32.5, 77, 33.2, 0.15);
    g.strokeStyle = gray(0.22);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(103, 41, 3.5, 6, 0.2, 0, TAU);
    g.stroke();
    g.restore();
    // curls, two rows; the outer row breaks the outline
    for (const [rad, n, from] of [[19, 11, -2.5], [25, 14, -2.75]] as const) {
      for (let i = 0; i < n; i++) {
        const an = from + (i / (n - 1)) * (0.45 - from);
        const x = 98 + Math.cos(an) * rad, y = 38 + Math.sin(an) * rad * 0.95;
        const cg = g.createRadialGradient(x - 1.2, y - 1.2, 0, x, y, 3.6);
        cg.addColorStop(0, gray(0.9 - (x - 70) / 120));
        cg.addColorStop(1, gray(0.12));
        g.fillStyle = cg;
        g.beginPath();
        g.arc(x, y, 3.4, 0, TAU);
        g.fill();
      }
    }

    // the roll bar and the bad frame
    const img = g.getImageData(0, 0, W, H), src = new Uint8ClampedArray(img.data), d = img.data;
    const bc = ((t * 14) % 150) - 25;
    for (let y = 0; y < H; y++) {
      const k = Math.max(0, 1 - Math.abs(y - bc) / 14);
      if (!k) continue;
      const sh = Math.round(k * 5 * Math.sin(y * 0.7 + t * 9));
      const stripe = 0.7 + 0.3 * Math.sin(y * 2.1 + t * 4);
      for (let x = 0; x < W; x++) {
        const v = src[(y * W + Math.max(0, Math.min(W - 1, x - sh))) * 4] * (1 - k * (1 - stripe));
        const i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    const n = Math.floor(t / 1.4);
    const gx = 62 + Math.floor(hash(n, 1) * 34), gy = 20 + Math.floor(hash(n, 2) * 34);
    const ai = a.getImageData(0, 0, W, H), ad = ai.data;
    for (let y = gy; y < gy + 13; y++) for (let x = gx; x < gx + 24; x++) {
      const i = (y * W + x) * 4;
      ad[i] = ad[i + 1] = ad[i + 2] = d[i] < 110 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = 255;
    }
    for (let y = gy - 11; y < gy - 4; y++) for (let x = gx + 3; x < gx + 10; x++) {
      const i = (y * W + x) * 4;
      ad[i] = ad[i + 1] = ad[i + 2] = 140;
    }
    g.putImageData(img, 0, 0);
    a.putImageData(ai, 0, 0);
  },
};

// ---------------------------------------------------------------- zone 4: Rampant Well

/** Looking down a well with stairs cut into its wall, turning. A bucket on a rope. The water glows. */
const well: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const cx = 90, cy = 56, R = 40;
    field(g, (x, y) => {
      const dx = x - cx, dy = (y - cy) * 1.7;
      const r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      if (r > R + 6) {
        const vig = 1 - Math.min(1, Math.hypot(x - cx, (y - cy) * 1.4) / 110);
        return (0.14 + 0.22 * fbm(x / 9, y / 6, 7)) * (0.5 + vig) + (hash(x, y, 3) > 0.985 ? 0.4 : 0);
      }
      if (r > R) {
        const u = (ang / TAU + 1) * 30;
        if (u % 1 < 0.09) return 0.14;
        if (r < R + 1.3) return 0.85;
        return (0.48 + 0.2 * hash(Math.floor(u), r > R + 3 ? 2 : 1)) * (0.8 + 0.25 * Math.sin(ang));
      }
      const k = 1 - r / R;
      const s = (ang / TAU) * 10 + k * 14 - t * 0.3;
      const f = ((s % 1) + 1) % 1;
      let v = 0.62 * Math.pow(1 - k, 1.6) * (f < 0.18 ? 0.35 : 0.95 + 0.1 * hash(Math.floor(s), 4));
      v *= 0.75 + 0.35 * -Math.sin(ang);
      if (k > 0.8) v += 0.1 * Math.max(0, Math.sin(r * 1.8 - t * 2.5)) * (k - 0.8) * 5;
      return v;
    });
    glow(a, cx, cy, 6, 0.45 + 0.2 * Math.sin(t * 1.3));
    // the frame over it, the rope and the bucket
    rect(g, 42, 14, 4, 46, 0.04);
    rect(g, 134, 14, 4, 46, 0.04);
    rect(g, 38, 10, 104, 4, 0.04);
    rect(g, 38, 10, 104, 1, 0.3);
    const bx = 90 + Math.sin(t * 0.8) * 1.5, by = 36 + Math.sin(t * 0.5);
    line(g, 90, 14, bx, by, 0.55, 0.8);
    shape(g, 0.45, [bx - 3, by, bx + 3, by, bx + 2.2, by + 4, bx - 2.2, by + 4]);
    rect(g, bx - 3, by, 6, 1, 0.75);
    flakes(g, t, 40, 0.7, 4, 5);
  },
};

// ---------------------------------------------------------------- zone 5: Vacuum Lock

/** The hatch. Bolts around it, frost creeping in from the corners, the wheel turning on its own. */
const lock: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const cx = 90, cy = 46, R = 36;
    const th = t * 0.25;
    field(g, (x, y) => {
      if (y > 89) return (x + y) % 10 < 5 ? 0.55 : 0.07;
      const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      const lit = Math.cos(ang + Math.PI * 0.75);
      if (r > R + 7) {
        const px = x % 30, py = y % 24;
        let v = 0.16 + 0.08 * (1 - y / H) + 0.05 * (hash(x >> 1, y >> 1, 5) - 0.5);
        if (px === 0 || py === 0) v = 0.1;
        else if (px === 1 || py === 1) v += 0.12;
        if ((px === 4 || px === 26) && (py === 4 || py === 20)) v = 0.7;
        const e = Math.min(x, W - 1 - x, y, H - 1 - y);
        const frost = fbm(x / 6, y / 6, 11) - e / 30;
        if (frost > 0.34) v = 0.42 + 0.3 * frost;
        if (r < R + 9 && lit < 0) v *= 0.5;
        return v;
      }
      if (r > R) return 0.5 + 0.25 * (r < R + 2 ? -lit : r > R + 5 ? lit : 0);
      if (r < 3.5) return 0.88;
      if (r < 5) return 0.1;
      if (r > 15 && r < 18.5) return 0.62 + 0.25 * lit;
      const q = Math.PI / 2;
      const wa = (((ang - th) % q) + q) % q;
      if (r < 15 && Math.min(wa, q - wa) * r < 1.3) return 0.72 + 0.15 * lit;
      return 0.28 + 0.07 * Math.sin(r * 0.9) + 0.12 * lit * (r / R) - (r > 18.5 && r < 21 && lit < 0 ? 0.12 : 0);
    });
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * TAU, bx = cx + Math.cos(an) * (R + 3.5), by = cy + Math.sin(an) * (R + 3.5);
      disc(g, bx + 0.6, by + 0.6, 1.6, 0.08);
      disc(g, bx, by, 1.5, 0.85);
    }
    // warning lamps, taking turns
    const on = Math.floor(t * 1.5) % 2;
    for (const [lx, k] of [[28, 0], [152, 1]] as const) {
      disc(g, lx, 14, 4.5, 0.12);
      disc(a, lx, 14, 2.6, on === k ? 1 : 0.3);
      if (on === k) glow(a, lx, 14, 9, 0.4);
    }
  },
};

// ---------------------------------------------------------------- zone 6: Barker Spiral

/** Someone at the foot of a staircase that climbs into a turning spiral in the sky. */
const spiral: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const cx = 104, cy = 32;
    field(g, (x, y) => {
      if (y > 74) return 0.05 + 0.05 * hash(x, y, 8);
      const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) + 0.01, ang = Math.atan2(dy, dx);
      const s = (ang / TAU) * 2 + Math.log(r) * 1.6 - t * 0.12;
      const band = Math.pow(0.5 + 0.5 * Math.cos(s * TAU), 4);
      return 0.05 + 0.1 * (1 - y / 74) + 0.78 * band * Math.exp(-r / 55) + (r < 3 ? 0.9 : 0);
    });
    for (let k = 0; k < 17; k++) {
      const y = 94 - k * 3, half = 20 * (1 - k / 21);
      rect(g, cx - half, y - 2, half * 2, 2, 0.16);
      rect(g, cx - half, y - 3, half * 2, 1, 0.5 - k * 0.012);
    }
    const robe = new Path2D('M62 52C56 52 54 58 55 63L50 70L45 96L80 96L74 70L69 63C70 58 68 52 62 52Z');
    g.save();
    g.translate(1.2, 0);
    g.fillStyle = gray(0.55);
    g.fill(robe);
    g.restore();
    g.fillStyle = gray(0.03);
    g.fill(robe);
    line(g, 60, 72, 56, 96, 0.1);
    line(g, 66, 72, 68, 96, 0.1);
    disc(a, cx, cy, 2, 1);
    glow(a, cx, cy, 7, 0.4 + 0.3 * Math.sin(t * 2));
    flakes(g, t, 36, 0.6, 6, -3);
  },
};

// ---------------------------------------------------------------- zone 7: Compiler

/** A turning diagram of rings, and a robed figure holding up the red thing it is compiling. */
const compiler: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    field(g, (x, y) => (x % 6 === 0 && y % 6 === 0 ? 0.35 : 0));
    const cx = 82, cy = 50;
    ring(g, cx, cy, 34.5, 0.38, 3);
    for (const r of [31, 29, 27]) ring(g, cx, cy, r, 0.95);
    const sway = 0.12 * Math.sin(t * 0.2);
    for (let i = 0; i < 7; i++) {
      const an = Math.PI + (i * Math.PI) / 6 + sway;
      const sx = cx + Math.cos(an) * 46, sy = cy + Math.sin(an) * 44;
      ring(g, sx, sy, 9, 0.95);
      ring(g, sx, sy, 7, 0.55);
      disc(g, sx, sy, 1, 0.9);
    }
    const ir = -t * 0.08;
    for (let k = 0; k < 6; k++) {
      const an = ir + (k * Math.PI) / 3;
      line(g, cx, cy, cx + Math.cos(an) * 27, cy + Math.sin(an) * 27, 0.6);
    }
    ring(g, cx + Math.cos(ir) * 9, cy + Math.sin(ir) * 9, 13, 0.8);
    ring(g, cx - Math.cos(ir) * 9, cy - Math.sin(ir) * 9, 13, 0.8);
    for (const off of [0, Math.PI / 3]) {
      g.strokeStyle = gray(0.7);
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k <= 3; k++) {
        const an = -ir + off + (k * TAU) / 3;
        const px = cx + Math.cos(an) * 21, py = cy + Math.sin(an) * 21;
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
    }

    const fig = new Path2D('M130 50C122 50 118 56 118 64L112 70C104 74 96 78 60 79L58 84C90 86 104 84 112 82L104 96L176 96L166 76C160 70 150 64 146 62C146 54 138 50 130 50Z');
    g.fillStyle = gray(0.4);
    g.fill(fig);
    g.save();
    g.clip(fig);
    for (let k = 0; k < 9; k++) line(g, 120 + k * 6, 64 + k, 108 + k * 8, 97, 0.14, 1);
    for (let k = 0; k < 4; k++) line(g, 70 + k * 10, 79, 76 + k * 10, 85, 0.2, 1);
    g.restore();
    g.fillStyle = gray(0);
    g.beginPath();
    g.ellipse(127, 60, 4, 6, 0.1, 0, TAU);
    g.fill();

    // the red sphere with a face, dripping
    disc(a, 50, 70, 9, 1);
    a.fillStyle = '#000';
    a.fillRect(45, 67, 3, 2);
    a.fillRect(52, 67, 3, 2);
    a.fillRect(47, 73, 5, 2);
    line(a, 51, 79, 53, 83, 1, 1);
    for (let k = 0; k < 3; k++) rect(a, 53, 84 + ((t * 9 + k * 5) % 13), 1, 1, 1);
  },
};

// ---------------------------------------------------------------- zone 8: Murmur

/**
 * A mine gallery whose walls are written over, floor to ceiling. The writing brightens in waves as it
 * talks, and a gramophone horn on a table in the corner takes it down, marks drifting into the bell.
 */
const murmur: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const f = flicker(t, 1);
    const wall = (u: number, v: number, x: number, y: number, side: number) => {
      const light = 0.12 * f * Math.max(0, 1 - Math.hypot(x - 90, y - 14) / 60) ** 2;
      if (v < 0.02 || v > 0.98) return 0.38 * (1 - 0.6 * u);
      const row = Math.floor(v * 10), fv = v * 10 - row;
      const k = Math.pow(u, 0.75) * 110, cell = Math.floor(k), fk = k - cell;
      const word = hash(Math.floor(k / 5), row, side + 9) > 0.25;
      const stroke = hash(cell, row * 7 + Math.floor(fv * 4), side) > 0.45 && fk < 0.7;
      if (fv > 0.25 && fv < 0.7 && word && stroke && u < 0.9) {
        const wave = Math.pow(Math.max(0, Math.sin(u * 9 - t * 1.6 + row * 0.8 + side * 2)), 3);
        return (0.15 + 0.78 * wave) * (1 - 0.5 * u) + light;
      }
      return 0.02 + light;
    };
    field(g, (x, y) => {
      if (x < 78) {
        const yt = (32 * x) / 78, yb = 96 - (36 * x) / 78;
        if (y >= yt && y <= yb) return wall(x / 78, (y - yt) / (yb - yt), x, y, 0);
      } else if (x > 102) {
        const u = (180 - x) / 78, yt = 32 * u, yb = 96 - 36 * u;
        if (y >= yt && y <= yb) return wall(u, (y - yt) / (yb - yt), x, y, 1);
      } else if (y >= 32 && y <= 60) return 0.01;
      if (y < 44) {
        const d = 44 - y, beam = ((40 / d) % 1 + 1) % 1;
        return (beam < 0.1 ? 0.1 : 0) + 0.1 * f * Math.max(0, 1 - Math.hypot(x - 90, y - 14) / 40);
      }
      const d = y - 44, s = (x - 90) / d, plank = ((s * 3) % 1 + 1) % 1;
      return (plank < 0.1 ? 0 : 0.06 + 0.04 * hash(Math.floor(s * 3), 0, 41)) * Math.min(1, d / 30 + 0.3) + 0.25 * Math.max(0, 1 - Math.hypot((x - 90) * 0.5, y - 80) / 22);
    });
    // the doorway at the far end, and a faint light past it
    line(g, 77.5, 32, 77.5, 60, 0.3);
    line(g, 102.5, 32, 102.5, 60, 0.3);
    line(g, 78, 31.5, 102, 31.5, 0.3);
    if (Math.sin(t * 0.3) > 0.4) rect(g, 89, 50, 2, 10, 0.18);

    // the bulb on its wire
    line(g, 90, 0, 90, 11, 0.3);
    rect(g, 89, 10, 2, 2, 0.4);
    disc(a, 90, 13.5, 1.8, 1);
    glow(a, 90, 13.5, 6, 0.4 * f);

    // the table and the gramophone
    rect(g, 126, 74, 40, 3, 0.34);
    rect(g, 126, 74, 40, 1, 0.55);
    line(g, 129, 77, 127, 96, 0.25, 1.5);
    line(g, 163, 77, 165, 96, 0.25, 1.5);
    rect(g, 132, 62, 26, 12, 0.24);
    rect(g, 132, 62, 26, 1, 0.5);
    for (let k = 0; k < 6; k++) rect(g, 136 + ((k * 2 + Math.floor(t * 6)) % 12), 58, 1, 4, 0.75);
    rect(g, 135, 58, 13, 1, 0.5);
    rect(a, 154, 66, 2, 2, Math.floor(t * 1.2) % 2 ? 1 : 0.25);
    const P = (p: number) => {
      const q = 1 - p;
      return [q * q * 142 + 2 * q * p * 148 + p * p * 116, q * q * 58 + 2 * q * p * 34 + p * p * 40];
    };
    for (let k = 0; k <= 16; k++) {
      const p = k / 16, [hx, hy] = P(p), r = 1.4 + Math.pow(p, 2.3) * 14;
      g.fillStyle = gray(k === 16 ? 0.02 : 0.42 + 0.5 * p);
      g.strokeStyle = gray(k === 16 ? 0.95 : 0.1);
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(hx, hy, r * 0.42, r, -0.15, 0, TAU);
      g.fill();
      g.stroke();
    }
    // what the walls say, drifting into the bell
    for (let k = 0; k < 12; k++) {
      const p = (t * 0.12 + k / 12) % 1;
      const x = 30 + p * 84, y = 52 - Math.sin(p * Math.PI) * 18 - p * 6 + Math.sin(k) * 3;
      rect(g, x, y, 1 + (k % 3 === 0 ? 1 : 0), 1, 0.9 * Math.sin(p * Math.PI));
    }
  },
};

// ---------------------------------------------------------------- zone 9: Plex

/** A ruined gate in a black wood under a black sun, three fires lit on it, and a pilgrim walking in. */
const plex: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    field(g, (x, y) => (y < 62
      ? 0.12 + 0.24 * (1 - y / 62) * (x / W) + 0.05 * (fbm(x / 20 + t * 0.03, y / 8, 12) - 0.5)
      : 0.05 + 0.03 * hash(x, y, 13)));
    ring(g, 142, 18, 12.5, 0.7 + 0.15 * Math.sin(t * 1.7), 2);
    ring(g, 142, 18, 16, 0.3);
    disc(g, 142, 18, 11, 0);
    for (let i = 0; i < 30; i++) pine(g, hash(i, 1, 14) * W, 63, 16 + hash(i, 2, 14) * 14, 0.11);
    // the gate
    rect(g, 60, 42, 60, 40, 0.1);
    for (let by = 42; by < 82; by += 4) {
      for (let bx = 60 + ((by / 4) % 2) * 4 - 4; bx < 120; bx += 8) {
        if (by < 50 && hash(bx, by, 15) < 0.35) continue;
        rect(g, Math.max(60, bx), by, Math.min(7, 120 - Math.max(60, bx), bx + 7 - 60), 3, 0.3 + 0.24 * hash(bx, by, 16));
      }
    }
    g.fillStyle = gray(0);
    g.fill(new Path2D('M82 82L82 62C82 53 98 53 98 62L98 82Z'));
    for (const [px, top] of [[50, 52], [124, 44]] as const) {
      rect(g, px - 1, top - 2, 9, 3, 0.68);
      rect(g, px, top, 7, 84 - top, 0.55);
      rect(g, px + 5, top, 2, 84 - top, 0.3);
      rect(g, px, top, 1, 84 - top, 0.78);
    }
    shape(g, 0.05, [49, 50, 53, 47, 55, 51, 58, 48, 58, 50]);
    for (let k = 0; k < 3; k++) {
      rect(g, 56 - k * 5, 82 + k * 3, 68 + k * 10, 3, 0.36 - k * 0.07);
      rect(g, 56 - k * 5, 82 + k * 3, 68 + k * 10, 1, 0.5 - k * 0.07);
    }
    for (let i = 0; i < 18; i++) {
      const x = hash(i, 3, 14) * W;
      if (x > 40 && x < 140) continue;
      pine(g, x, 97, 26 + hash(i, 4, 14) * 22, 0.02, 0.42);
    }
    for (const [bx, k] of [[68, 0], [90, 1], [112, 2]] as const) {
      shape(g, 0.5, [bx - 3, 39, bx + 3, 39, bx + 2, 42, bx - 2, 42]);
      const fl = Math.sin(t * 8 + k * 2) * 0.6 + Math.sin(t * 13 + k) * 0.4;
      shape(a, 1, [bx + fl * 0.5, 31.5 - fl, bx - 2.2, 36.5, bx, 39, bx + 2.2, 36.5]);
      glow(a, bx, 35.5, 5, 0.3);
    }
    // the pilgrim, and the heart over them
    shape(a, 1, [131, 95, 132, 88.5, 134, 88.5, 135, 95]);
    disc(a, 133, 87, 1.5, 1);
    const hy = 81 + Math.round(Math.sin(t * 2));
    rect(a, 131, hy, 2, 1, 1);
    rect(a, 134, hy, 2, 1, 1);
    rect(a, 131, hy + 1, 5, 1, 1);
    rect(a, 132, hy + 2, 3, 1, 1);
    rect(a, 133, hy + 3, 1, 1, 1);
    flakes(g, t, 30, 0.5, 9, 4);
  },
};

// ---------------------------------------------------------------- set dressing on the floor

/** The relay mast in the fog, and its keeper with a lantern. Portrait. */
const keeper: Scene = {
  w: 120, h: 160,
  draw(g, a, t) {
    field(g, (x, y) => (y > 138
      ? 0.6 + 0.15 * ((y - 138) / 22) + 0.05 * (hash(x, y, 20) - 0.5)
      : 0.18 + 0.34 * (y / 138) + 0.1 * (fbm(x / 24 + t * 0.03, y / 14, 21) - 0.5)));
    const lx = (y: number, s: number) => 60 + s * (3 + ((y - 24) / 116) * 9);
    line(g, 48, 140, 57, 24, 0.12, 1.3);
    line(g, 72, 140, 63, 24, 0.12, 1.3);
    for (let k = 0; k < 9; k++) {
      const y0 = 140 - k * 13, y1 = y0 - 13;
      line(g, lx(y0, -1), y0, lx(y1, 1), y1, 0.14, 0.7);
      line(g, lx(y0, 1), y0, lx(y1, -1), y1, 0.14, 0.7);
    }
    line(g, 60, 24, 60, 6, 0.12, 1);
    g.fillStyle = gray(0.12);
    g.beginPath();
    g.ellipse(67, 36, 3, 5, 0.4, 0, TAU);
    g.fill();
    disc(a, 60, 6, 1.3, Math.floor(t * 0.8) % 2 ? 1 : 0.2);
    // the keeper
    g.fillStyle = gray(0.03);
    g.fill(new Path2D('M28 98C20 98 17 106 18 112L10 124L4 160L54 160L46 124L40 112C40 104 36 98 28 98Z'));
    line(g, 40, 117, 51, 125, 0.03, 3);
    line(g, 52, 124, 52, 127, 0.03, 1);
    rect(g, 49, 127, 6, 8, 0.1);
    const f = flicker(t);
    disc(a, 52, 131, 1.8, 1);
    glow(a, 52, 131, 13, 0.45 * f);
    glow(g, 54, 150, 26, 0.22 * f);
    flakes(g, t, 120, 0.03, 22, 8, 120, 160);
  },
};

/** Lull from the road: a church in the fog, a lamp still lit, birds. Landscape. */
const lull: Scene = {
  w: 200, h: 112,
  draw(g, a, t) {
    field(g, (x, y) => (y > 88
      ? (Math.abs(x - 70 - (y - 88) * 2.5) < 26 + (y - 88) * 2 ? 0.22 : 0.56) + 0.05 * (hash(x, y, 30) - 0.5)
      : 0.5 - 0.18 * (y / 88) + 0.08 * (fbm(x / 30 + t * 0.05, y / 10, 31) - 0.5)));
    for (let i = 0; i < 14; i++) {
      const x = i * 15 + hash(i, 1, 32) * 6, w = 9 + hash(i, 2, 32) * 6, h = 8 + hash(i, 3, 32) * 12;
      rect(g, x, 88 - h, w, h, 0.42);
      shape(g, 0.42, [x - 1, 88 - h, x + w / 2, 88 - h - 5, x + w + 1, 88 - h]);
    }
    rect(g, 112, 54, 46, 34, 0.2);
    shape(g, 0.2, [110, 54, 135, 38, 160, 54]);
    rect(g, 148, 30, 10, 58, 0.2);
    shape(g, 0.2, [146, 30, 153, 6, 160, 30]);
    line(g, 153, 2, 153, 7, 0.2);
    line(g, 151, 3.5, 155, 3.5, 0.2);
    for (const wx of [118, 126, 134, 142]) rect(g, wx, 62, 3, 10, 0.08);
    rect(g, 151, 40, 4, 8, 0.08);
    if (Math.sin(t * 0.4) > 0.6) rect(a, 126, 64, 3, 8, 1);
    // the lamp
    rect(g, 39, 38, 2, 52, 0.03);
    line(g, 40, 39, 49, 41, 0.03, 1.5);
    shape(g, 0.03, [46, 41, 52, 41, 51, 44, 47, 44]);
    const f = flicker(t, 2);
    rect(a, 47.5, 44, 3, 1, 1);
    glow(a, 49, 45, 8, 0.35 * f);
    glow(g, 52, 96, 26, 0.3 * f);
    // birds
    for (let i = 0; i < 5; i++) {
      const bx = ((t * 6 + i * 47) % 240) - 20, by = 16 + i * 5 + Math.sin(t * 2 + i) * 2;
      const wing = Math.sin(t * 8 + i) > 0 ? 2 : 0;
      line(g, bx - 3, by - wing, bx, by, 0.05);
      line(g, bx, by, bx + 3, by - wing, 0.05);
    }
    flakes(g, t, 80, 0.05, 33, 6, 200, 112);
  },
};

// ---------------------------------------------------------------- the side rooms

/** The back room: a window full of snow, a lamp, an armchair nobody sits in, the stove going. */
const backroom: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const f = flicker(t, 4);
    field(g, (x, y) => {
      if (y > 70) {
        const d = y - 50, sx = (x - 90) / d, board = ((sx * 4) % 1 + 1) % 1;
        return (board < 0.08 ? 0.01 : 0.06 + 0.03 * hash(Math.floor(sx * 4), 0, 50)) + 0.2 * f * Math.max(0, 1 - Math.hypot((x - 140) * 0.6, y - 82) / 30);
      }
      const stripe = x % 9 < 4 ? 0.06 : 0.035;
      return stripe + 0.02 * (hash(x >> 1, y >> 1, 51) - 0.5) + 0.32 * f * Math.max(0, 1 - Math.hypot(x - 34, y - 26) / 50) ** 2;
    });
    rect(g, 0, 69, W, 2, 0.28);
    // the window, snowing
    rect(g, 58, 12, 34, 38, 0.3);
    rect(g, 60, 14, 30, 34, 0.42);
    g.save();
    g.translate(60, 14);
    flakes(g, t, 26, 0.04, 52, 5, 30, 34);
    g.restore();
    rect(g, 74, 14, 2, 34, 0.3);
    rect(g, 60, 30, 30, 2, 0.3);
    shape(g, 0.16, [54, 10, 62, 10, 60, 52, 54, 54]);
    shape(g, 0.16, [96, 10, 88, 10, 90, 52, 96, 54]);
    // the lamp
    rect(g, 33, 26, 2, 52, 0.05);
    shape(g, 0.5, [27, 26, 41, 26, 38, 18, 30, 18]);
    rect(g, 28, 77, 12, 2, 0.05);
    glow(a, 34, 27, 3, 0.6 * f);
    // the clock
    disc(g, 120, 22, 6, 0.32);
    disc(g, 120, 22, 5, 0.12);
    const hand = t * 0.5;
    line(g, 120, 22, 120 + Math.cos(hand) * 4, 22 + Math.sin(hand) * 4, 0.6);
    line(g, 120, 22, 121, 19, 0.6);
    // rug and the armchair
    g.fillStyle = gray(0.14);
    g.beginPath();
    g.ellipse(96, 84, 34, 7, 0, 0, TAU);
    g.fill();
    g.strokeStyle = gray(0.34);
    g.beginPath();
    g.ellipse(96, 84, 30, 5.5, 0, 0, TAU);
    g.stroke();
    const chair = new Path2D('M78 82L78 60C78 52 82 50 90 50L104 50C112 50 116 52 116 60L116 82L112 82L112 72L82 72L82 82Z');
    g.fillStyle = gray(0.2);
    g.fill(chair);
    g.strokeStyle = gray(0.42);
    g.lineWidth = 1;
    g.stroke(chair);
    rect(g, 74, 62, 6, 16, 0.3);
    rect(g, 114, 62, 6, 16, 0.14);
    rect(g, 82, 66, 30, 6, 0.32);
    rect(g, 86, 54, 22, 10, 0.12);
    // the stove
    rect(g, 141, 8, 4, 40, 0.2);
    g.fillStyle = gray(0.22);
    g.beginPath();
    g.ellipse(143, 62, 13, 16, 0, 0, TAU);
    g.fill();
    rect(g, 133, 76, 3, 8, 0.22);
    rect(g, 150, 76, 3, 8, 0.22);
    rect(g, 138, 46, 10, 4, 0.34);
    rect(g, 132, 56, 1, 14, 0.4);
    for (let k = 0; k < 3; k++) rect(a, 137, 60 + k * 3, 12, 1, f > 0.72 ? 1 : 0.7);
    glow(a, 143, 63, 9, 0.35 * f);
  },
};

/** The instruments: a receiver with a lit dial, a scope drawing what it hears, reels turning. */
const instruments: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    field(g, (x, y) => (y > 72 ? 0.16 + 0.03 * hash(x, y, 60) : 0.03 + 0.18 * Math.max(0, 1 - Math.hypot(x - 90, y - 4) / 80) ** 2));
    rect(g, 0, 72, W, 2, 0.4);
    line(g, 90, 0, 90, 6, 0.3);
    shape(g, 0.45, [80, 10, 100, 10, 95, 4, 85, 4]);
    // the receiver
    rect(g, 18, 34, 64, 38, 0.24);
    rect(g, 18, 34, 64, 1, 0.5);
    rect(g, 24, 40, 40, 12, 0.06);
    for (let k = 0; k < 9; k++) rect(g, 26 + k * 4.4, 42, 1, k % 2 ? 2 : 4, 0.5);
    rect(a, 30 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 30, 40, 1, 12, 1);
    glow(g, 44, 46, 18, 0.12);
    for (let k = 0; k < 4; k++) {
      disc(g, 28 + k * 11, 62, 3.5, 0.5);
      line(g, 28 + k * 11, 62, 28 + k * 11 + Math.cos(k * 1.7 + t * 0.2) * 3, 62 + Math.sin(k * 1.7 + t * 0.2) * 3, 0.05);
    }
    for (let k = 0; k < 6; k++) rect(g, 68, 40 + k * 4, 10, 2, 0.12);
    disc(a, 73, 66, 1.5, Math.floor(t * 2) % 2 ? 1 : 0.2);
    // the scope
    rect(g, 92, 30, 44, 42, 0.2);
    rect(g, 96, 34, 36, 26, 0.04);
    for (let x = 96; x < 132; x += 6) rect(g, x, 34, 1, 26, 0.1);
    g.strokeStyle = gray(0.95);
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= 36; x++) {
      const y = 47 + Math.sin(x * 0.45 - t * 4) * 6 * Math.sin(t * 0.7 + x * 0.05) + (hash(x, Math.floor(t * 8), 61) - 0.5) * 2;
      if (x) g.lineTo(96 + x, y); else g.moveTo(96, y);
    }
    g.stroke();
    disc(g, 104, 66, 2.5, 0.5);
    disc(g, 124, 66, 2.5, 0.5);
    // the reel to reel
    rect(g, 142, 38, 32, 34, 0.22);
    for (const [cx, sp] of [[150, 1], [166, 1.3]] as const) {
      disc(g, cx, 50, 6.5, 0.55);
      disc(g, cx, 50, 1.5, 0.1);
      for (let k = 0; k < 3; k++) {
        const an = t * sp + (k * TAU) / 3;
        disc(g, cx + Math.cos(an) * 3.6, 50 + Math.sin(an) * 3.6, 1.3, 0.12);
      }
    }
    line(g, 150, 56.5, 166, 56.5, 0.06);
    rect(g, 148, 62, 20, 4, 0.1);
    // cables over the edge of the desk
    g.strokeStyle = gray(0.08);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(40, 72);
    g.bezierCurveTo(44, 90, 70, 94, 76, 96);
    g.moveTo(120, 72);
    g.bezierCurveTo(118, 86, 130, 92, 150, 96);
    g.stroke();
  },
};

/** The kiln: a brick furnace with its mouth open, the fire turning over, embers rising out of it. */
const kiln: Scene = {
  w: W, h: H,
  draw(g, a, t) {
    const cx = 90;
    field(g, (x, y) => {
      const inBody = x > 44 && x < 136 && y > 14;
      if (!inBody) return y > 86 ? 0.12 + 0.05 * hash(x, y, 70) : 0.04 + 0.03 * hash(x >> 2, y >> 2, 71);
      const row = Math.floor((y - 14) / 5), off = row % 2 ? 6 : 0;
      const mortar = (y - 14) % 5 === 0 || (x + off) % 12 === 0;
      const heat = Math.max(0, 1 - Math.hypot(x - cx, (y - 66) * 1.3) / 44);
      return mortar ? 0.06 : 0.2 + 0.1 * hash(Math.floor((x + off) / 12), row, 72) + 0.3 * heat;
    });
    // the chimney
    rect(g, 78, 0, 24, 14, 0.18);
    rect(g, 76, 12, 28, 3, 0.3);
    // the mouth: fire rising through noise
    const mouth = new Path2D('M66 86L66 62C66 46 114 46 114 62L114 86Z');
    g.fillStyle = gray(0.02);
    g.fill(mouth);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let y = 48; y < 86; y++) for (let x = 66; x < 114; x++) {
      if (!g.isPointInPath(mouth, x + 0.5, y + 0.5)) continue;
      const fy = (86 - y) / 38;
      const v = fbm(x / 7, y / 6 + t * 1.6, 73) * 1.25 - fy * 0.85 + 0.15 * Math.sin(x * 0.3 + t * 3);
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(1, v)) * 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = gray(0.5);
    g.lineWidth = 2;
    g.stroke(mouth);
    // coals at the bottom of the mouth glow in the second ink
    for (let k = 0; k < 14; k++) {
      const x = 68 + k * 3.3, y = 82 + Math.sin(k * 2.1) * 1.5;
      if (Math.sin(t * 2 + k * 1.7) > -0.2) disc(a, x, y, 1.3, 1);
    }
    // embers rising
    for (let k = 0; k < 16; k++) {
      const p = (t * 0.25 + hash(k, 1, 74)) % 1;
      const x = cx + (hash(k, 2, 74) - 0.5) * 40 + Math.sin(t * 2 + k) * 4 * p;
      const y = 60 - p * 62;
      rect(a, x, y, 1, 1, p < 0.85 ? 1 : 0);
    }
    // tongs and a bucket of ash
    line(g, 146, 88, 156, 40, 0.45, 1.2);
    line(g, 150, 88, 157, 40, 0.45, 1.2);
    shape(g, 0.3, [20, 88, 38, 88, 36, 72, 22, 72]);
    rect(g, 21, 72, 16, 2, 0.5);
    for (let k = 0; k < 6; k++) disc(g, 24 + k * 2.5, 71, 1.5, 0.16);
  },
};

export const ZONE_SCENES: Scene[] = [bore, conduit, buffer, well, lock, spiral, compiler, murmur, plex];

// ---------------------------------------------------------------- the Black Citadel

/**
 * The thing behind the citadel: a black shape taller than the walls against a sick yellow sky, wearing the
 * towers like a crown, with too many eyes, drawing a slow column of light up into its mouth.
 */
const citadel: Scene = {
  w: 200, h: 120,
  draw(g, a, t) {
    const HZ = 104;
    const br = Math.sin(t * 0.6) * 1.2;
    field(g, (x, y) => {
      if (y >= HZ) return 0.1 + 0.08 * hash(x, y, 70);
      const d = Math.hypot(x - 100, (y - 50) * 1.3);
      return 0.3 + 0.62 * Math.max(0, 1 - d / 105) ** 1.3 + 0.08 * (fbm(x / 26 + t * 0.03, y / 9, 71) - 0.5);
    });
    g.fillStyle = gray(0);
    // shoulders and a long back, hunched over the wall
    g.beginPath();
    g.moveTo(10, HZ);
    g.bezierCurveTo(18, 70 - br, 44, 52 - br, 70, 50 - br);
    g.lineTo(130, 50 - br);
    g.bezierCurveTo(156, 52 - br, 182, 70 - br, 190, HZ);
    g.closePath();
    g.fill();
    // the neck and a long, narrow head, tipped forward
    g.beginPath();
    g.moveTo(84, 54 - br);
    g.bezierCurveTo(84, 40 - br, 86, 30 - br, 90, 24 - br);
    g.bezierCurveTo(94, 16 - br, 106, 16 - br, 110, 24 - br);
    g.bezierCurveTo(114, 30 - br, 116, 40 - br, 116, 54 - br);
    g.fill();
    // horns: the citadel's towers grown out of its skull, crooked
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const bx = 100 + s * (6 + k * 6), by = 22 - br + k * 3, h = 20 - k * 5;
        shape(g, 0, [bx - 2, by, bx + s * (4 + k * 3), by - h, bx + 2 + s * 1, by]);
        if ((Math.floor(t * 0.6) + k + (s > 0 ? 2 : 0)) % 5 === 0) rect(a, bx + s * (2 + k), by - h * 0.5, 1, 1, 1);
      }
    }
    rect(g, 98, 0, 4, 20 - br, 0);
    shape(g, 0, [97, 4, 100, -4, 103, 4]);
    // arms down to the snow, long fingers splayed
    for (const s of [-1, 1]) {
      const sx = 100 + s * 58;
      g.beginPath();
      g.moveTo(100 + s * 34, 56 - br);
      g.quadraticCurveTo(sx + s * 16, 66, sx + s * 4, HZ);
      g.lineTo(sx - s * 6, HZ);
      g.quadraticCurveTo(sx - s * 4, 74, 100 + s * 22, 66 - br);
      g.fill();
      for (let k = 0; k < 4; k++) line(g, sx - s * 2, HZ - 2, sx + s * (k * 6 - 10), HZ + 6, 0, 1.4);
    }
    // eyes, too many, out of step: four on the head, a scatter down the chest
    const eyes: [number, number, number][] = [[94, 30, 1.4], [106, 30, 1.4], [97, 36, 0.9], [103, 36, 0.9]];
    for (let i = 0; i < 12; i++) eyes.push([100 + (hash(i, 1, 72) - 0.5) * 44, 58 + hash(i, 2, 72) * 26, hash(i, 4, 72) < 0.3 ? 1.2 : 0.8]);
    eyes.forEach(([ex, ey, r], i) => {
      if (Math.sin(t * (0.5 + hash(i, 3, 72)) + i * 2) > -0.8) { disc(a, ex, ey - br, r, 1); disc(g, ex, ey - br, r, 1); }
    });
    // the mouth at the throat, and the column of light it drinks up off the snow
    const f = flicker(t, 5);
    g.fillStyle = gray(0.7 * f);
    g.beginPath();
    g.ellipse(100, 46 - br, 4, 1.5 + Math.max(0, Math.sin(t * 1.3)) * 1.5, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 40; i++) {
      const k = (hash(i, 5, 73) + t * (0.08 + 0.05 * hash(i, 6, 73))) % 1;
      const x = 100 + (hash(i, 7, 73) - 0.5) * 80 * (1 - k) ** 1.5, y = HZ + 6 - k * (HZ + 6 - 46 + br);
      rect(g, Math.floor(x), Math.floor(y), 1, 1, 0.95);
      if (i % 4 === 0) rect(a, Math.floor(x), Math.floor(y), 1, 1, 1);
    }
    // the wall in front of it, small, its gate standing open
    for (let x = 0; x < 200; x += 6) rect(g, x, HZ - 7 - (x % 12 ? 0 : 2), 5, 9, 0.04);
    rect(g, 96, HZ - 6, 8, 6, 0.55 * f);
    flakes(g, t, 50, 0.02, 74, -3, 200, 120);
  },
};

/**
 * The Dream Engine: someone asleep on an iron cot, wired at the temples, the dream drawn off through a
 * coil of pipe into a furnace door that opens on the dark.
 */
const dreamEngine: Scene = {
  w: 200, h: 112,
  draw(g, a, t) {
    field(g, (x, y) => 0.08 + 0.06 * (y / 112) + 0.04 * (fbm(x / 30, y / 12 + t * 0.02, 80) - 0.5));
    rect(g, 0, 92, 200, 20, 0.16);
    for (let x = 0; x < 200; x += 14) line(g, x, 92, x - 10, 112, 0.1);
    // the cot and the sleeper
    rect(g, 18, 74, 74, 3, 0.4);
    for (const lx of [20, 88]) rect(g, lx, 77, 2, 15, 0.35);
    g.fillStyle = gray(0.62);
    g.beginPath();
    g.ellipse(56, 71, 30, 5, 0, 0, TAU);
    g.fill();
    disc(g, 26, 67, 5, 0.7);
    const breath = Math.sin(t * 0.9);
    g.fillStyle = gray(0.66);
    g.beginPath();
    g.ellipse(52, 68 - breath * 0.8, 14, 3, 0, 0, TAU);
    g.fill();
    // wires from the temples, up into a coil
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = gray(0.3);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(24 + k * 2, 63);
      g.bezierCurveTo(20 + k * 6, 30, 70, 18 + k * 3, 110, 30 + k * 2);
      g.stroke();
    }
    for (let k = 0; k < 6; k++) { ring(g, 120, 30 + k * 5, 8, 0.38, 1.5); }
    line(g, 120, 60, 150, 60, 0.38, 3);
    // pulses travelling down the wires: the dream leaving
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.35 + i / 4) % 1;
      const bx = (1 - k) ** 3 * 26 + 3 * (1 - k) ** 2 * k * 22 + 3 * (1 - k) * k * k * 70 + k ** 3 * 110;
      const by = (1 - k) ** 3 * 63 + 3 * (1 - k) ** 2 * k * 30 + 3 * (1 - k) * k * k * 20 + k ** 3 * 31;
      disc(a, bx, by, 1.4, 1);
    }
    // the furnace
    rect(g, 146, 34, 44, 58, 0.26);
    rect(g, 150, 30, 36, 4, 0.3);
    rect(g, 160, 6, 10, 24, 0.22);
    const f = flicker(t, 3);
    rect(g, 154, 56, 28, 24, 0);
    for (let i = 0; i < 40; i++) {
      const x = 154 + hash(i, 1, 81) * 28, y = 80 - ((hash(i, 2, 81) * 24 + t * (6 + 6 * hash(i, 3, 81))) % 24);
      rect(a, Math.floor(x), Math.floor(y), 1, 1, hash(i, 4, 81) < 0.5 ? 1 : 0);
    }
    glow(g, 168, 72, 30, 0.22 * f);
    rect(g, 152, 54, 32, 2, 0.45);
    // the gauge
    ring(g, 176, 44, 5, 0.5, 1);
    const ang = -2.4 + 1.4 * (0.5 + 0.5 * Math.sin(t * 0.5));
    line(g, 176, 44, 176 + Math.cos(ang) * 4, 44 + Math.sin(ang) * 4, 0.9);
  },
};

export const SCENES = { keeper, lull, backroom, instruments, kiln, citadel, dreamEngine };
