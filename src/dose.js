import * as THREE from 'three';

export const SKIN_SCALE_GY = 5;
export const FIELD_MIN = 0.12;
export const FIELD_MAX = 0.48;

const MU_WATER = [
  [30, 0.3756], [40, 0.2683], [50, 0.2269], [60, 0.2059], [70, 0.1957],
  [80, 0.1837], [90, 0.1754], [100, 0.1707], [120, 0.1649], [150, 0.1575]
];

export function muWater(keV) {
  if (keV <= MU_WATER[0][0]) return MU_WATER[0][1];
  for (let i = 1; i < MU_WATER.length; i++) {
    if (keV <= MU_WATER[i][0]) {
      const [e0, m0] = MU_WATER[i - 1];
      const [e1, m1] = MU_WATER[i];
      return m0 + (m1 - m0) * (keV - e0) / (e1 - e0);
    }
  }
  return MU_WATER[MU_WATER.length - 1][1];
}

export function effectiveEnergy(kVp) {
  return kVp * 0.45;
}

export function outputMicroGyPerMas(kVp) {
  return 45 * Math.pow(kVp / 80, 2.6);
}

export function backscatterFactor(kVp, fieldAtDet = 0.3) {
  const area = fieldAtDet * fieldAtDet * 1e4;
  const fb = Math.min(0.5, 0.25 * Math.pow(area / 100, 0.3) * Math.pow(80 / kVp, 1.2));
  return 1 + fb;
}

export function scatterFraction(kVp, fieldAtDet = 0.3) {
  const area = fieldAtDet * fieldAtDet * 1e4;
  return Math.min(0.8, 0.08 * Math.pow(area / 100, 0.35) * Math.pow(kVp / 80, 1.5));
}

export const MAT = { AIR: 0, WATER: 1, BONE: 2, METAL: 3, TABLE: 4 };
const MAT_MU_SCALE = [0, 1, 1.9, 8, 1];

export function fibDirs(n) {
  const dirs = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    dirs.push({ x: Math.cos(th) * rad, y, z: Math.sin(th) * rad });
  }
  return dirs;
}

export function scatterRateAtGrid(field, x, y, z) {
  return field.scatterRateAt(x, y, z);
}

const CMAP = [
  [0.0, [30, 58, 138]],
  [0.1, [6, 182, 212]],
  [0.2, [34, 197, 94]],
  [0.4, [234, 179, 8]],
  [0.6, [249, 115, 22]],
  [1.0, [239, 68, 68]]
];

const ROOM_CMAP = [
  [0.0, [64, 242, 89]],
  [0.3, [250, 229, 38]],
  [0.55, [242, 64, 26]],
  [0.75, [153, 26, 229]],
  [1.0, [20, 0, 38]]
];

export function colormapRoom(t, out = [0, 0, 0]) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < ROOM_CMAP.length; i++) {
    if (x <= ROOM_CMAP[i][0]) {
      const [t0, c0] = ROOM_CMAP[i - 1];
      const [t1, c1] = ROOM_CMAP[i];
      const f = (x - t0) / (t1 - t0);
      out[0] = (c0[0] + (c1[0] - c0[0]) * f) / 255;
      out[1] = (c0[1] + (c1[1] - c0[1]) * f) / 255;
      out[2] = (c0[2] + (c1[2] - c0[2]) * f) / 255;
      return out;
    }
  }
  const c = ROOM_CMAP[ROOM_CMAP.length - 1][1];
  out[0] = c[0] / 255; out[1] = c[1] / 255; out[2] = c[2] / 255;
  return out;
}

export function colormap(t, out = [0, 0, 0]) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < CMAP.length; i++) {
    if (x <= CMAP[i][0]) {
      const [t0, c0] = CMAP[i - 1];
      const [t1, c1] = CMAP[i];
      const f = (x - t0) / (t1 - t0);
      out[0] = (c0[0] + (c1[0] - c0[0]) * f) / 255;
      out[1] = (c0[1] + (c1[1] - c0[1]) * f) / 255;
      out[2] = (c0[2] + (c1[2] - c0[2]) * f) / 255;
      return out;
    }
  }
  const c = CMAP[CMAP.length - 1][1];
  out[0] = c[0] / 255; out[1] = c[1] / 255; out[2] = c[2] / 255;
  return out;
}

export function rayEllipsoid(o, d, c, r) {
  const ox = (o.x - c.x) / r.x, oy = (o.y - c.y) / r.y, oz = (o.z - c.z) / r.z;
  const dx = d.x / r.x, dy = d.y / r.y, dz = d.z / r.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const cc = ox * ox + oy * oy + oz * oz - 1;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  return [t1, t2];
}

export function chordThrough(o, d, ellipsoids) {
  let total = 0;
  for (const e of ellipsoids) {
    const hit = rayEllipsoid(o, d, e.c, e.r);
    if (hit && hit[1] > 0) {
      total += Math.max(0, hit[1] - Math.max(0, hit[0])) * (e.mu ?? 1);
    }
  }
  return total;
}

export function computeBeamGeometry(source, beamDir, iso, sid, ellipsoidsWorld, fieldFrac) {
  const dSrcIso = source.distanceTo(iso);
  const irp = iso.clone().addScaledVector(beamDir, -0.15);
  const dSrcIrp = source.distanceTo(irp);
  const fieldAtDet = FIELD_MIN + (FIELD_MAX - FIELD_MIN) * fieldFrac;
  let ssd = dSrcIso;
  for (const e of ellipsoidsWorld) {
    const hit = rayEllipsoid(source, beamDir, e.c, e.r);
    if (hit && hit[0] > 0 && hit[0] < ssd) ssd = hit[0];
  }
  const inBeam = chordThrough(source, beamDir, ellipsoidsWorld) > 0.02;
  return {
    source, beamDir, iso, sid, dSrcIso, dSrcIrp, irp,
    fieldAtDet, ssd, inBeam,
    scatter: inBeam ? 1.5 : 1.0
  };
}

export const ROOM_SCALE_GY = 5;
export const FIELD_SIZE = 4.0;
export const FIELD_N = 50;
export const PLANE_SIZE = 1.32;
export const RATE_SCALE_USVH = 1000;
export const DOSE_FLOOR_USV = 100;

const CLOUD_CMAP = [
  [0.0, [250, 240, 60]],
  [0.33, [250, 150, 30]],
  [0.55, [230, 50, 30]],
  [1.0, [140, 20, 200]]
];

const INFERNO_CMAP = [
  [0.0, [10, 8, 30]],
  [0.25, [90, 20, 120]],
  [0.5, [200, 60, 30]],
  [0.75, [250, 170, 40]],
  [1.0, [252, 250, 200]]
];

export const COLORMAP_NAMES = ['room', 'cloud', 'inferno', 'bluered'];

const NAMED = { room: ROOM_CMAP, cloud: CLOUD_CMAP, inferno: INFERNO_CMAP };

export function colormapNamed(name, t, out = [0, 0, 0]) {
  if (name === 'bluered') return colormap(t, out);
  const map = NAMED[name] || ROOM_CMAP;
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < map.length; i++) {
    if (x <= map[i][0]) {
      const [t0, c0] = map[i - 1];
      const [t1, c1] = map[i];
      const f = (x - t0) / (t1 - t0);
      out[0] = (c0[0] + (c1[0] - c0[0]) * f) / 255;
      out[1] = (c0[1] + (c1[1] - c0[1]) * f) / 255;
      out[2] = (c0[2] + (c1[2] - c0[2]) * f) / 255;
      return out;
    }
  }
  const c = map[map.length - 1][1];
  out[0] = c[0] / 255; out[1] = c[1] / 255; out[2] = c[2] / 255;
  return out;
}

export function logMap(usv, scale) {
  return Math.log10(1 + Math.max(0, usv)) / Math.log10(1 + scale);
}

export function colormapCloud(t, out = [0, 0, 0]) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < CLOUD_CMAP.length; i++) {
    if (x <= CLOUD_CMAP[i][0]) {
      const [t0, c0] = CLOUD_CMAP[i - 1];
      const [t1, c1] = CLOUD_CMAP[i];
      const f = (x - t0) / (t1 - t0);
      out[0] = (c0[0] + (c1[0] - c0[0]) * f) / 255;
      out[1] = (c0[1] + (c1[1] - c0[1]) * f) / 255;
      out[2] = (c0[2] + (c1[2] - c0[2]) * f) / 255;
      return out;
    }
  }
  const c = CLOUD_CMAP[CLOUD_CMAP.length - 1][1];
  out[0] = c[0] / 255; out[1] = c[1] / 255; out[2] = c[2] / 255;
  return out;
}

export class DoseField {
  constructor(center, n = FIELD_N) {
    this.n = n;
    this.size = FIELD_SIZE;
    this.center = center.clone();
    this.cell = this.size / this.n;
    this.nc = Math.max(4, Math.round(n / 2));
    this.cellC = this.size / this.nc;
    this.data = new Float32Array(this.n ** 3);
    this.scatterRate = new Float32Array(this.nc ** 3);
    this.scatterTmp = new Float32Array(this.nc ** 3);
    this.mat = new Uint8Array(this.n ** 3);
    this.max = 0;
  }
  reset() {
    this.data.fill(0);
    this.scatterRate.fill(0);
    this.max = 0;
  }
  voxelPoint(i, j, k, out) {
    const h = this.size / 2, c = this.center, cell = this.cell;
    out.x = c.x - h + (i + 0.5) * cell;
    out.y = c.y - h + (j + 0.5) * cell;
    out.z = c.z - h + (k + 0.5) * cell;
    return out;
  }
  voxelIndex(x, y, z) {
    const n = this.n, h = this.size / 2, cell = this.cell, c = this.center;
    const i = Math.floor((x - c.x + h) / cell);
    const j = Math.floor((y - c.y + h) / cell);
    const k = Math.floor((z - c.z + h) / cell);
    if (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n) return -1;
    return (k * n + j) * n + i;
  }
  coarseIndex(x, y, z) {
    const nc = this.nc, h = this.size / 2, cellC = this.cellC, c = this.center;
    const i = Math.floor((x - c.x + h) / cellC);
    const j = Math.floor((y - c.y + h) / cellC);
    const k = Math.floor((z - c.z + h) / cellC);
    if (i < 0 || j < 0 || k < 0 || i >= nc || j >= nc || k >= nc) return -1;
    return (k * nc + j) * nc + i;
  }
  scatterRateAt(x, y, z) {
    const nc = this.nc, h = this.size / 2, cellC = this.cellC, c = this.center;
    const fu = (x - c.x + h) / cellC - 0.5;
    const fv = (y - c.y + h) / cellC - 0.5;
    const fw = (z - c.z + h) / cellC - 0.5;
    const i0 = Math.floor(fu), j0 = Math.floor(fv), k0 = Math.floor(fw);
    if (i0 < -1 || j0 < -1 || k0 < -1 || i0 > nc || j0 > nc || k0 > nc) return 0;
    const au = fu - i0, av = fv - j0, aw = fw - k0;
    let sum = 0;
    for (let dk = 0; dk <= 1; dk++) {
      const k = k0 + dk;
      if (k < 0 || k >= nc) continue;
      for (let dj = 0; dj <= 1; dj++) {
        const j = j0 + dj;
        if (j < 0 || j >= nc) continue;
        const wv = (dj ? av : 1 - av) * (dk ? aw : 1 - aw);
        for (let di = 0; di <= 1; di++) {
          const i = i0 + di;
          if (i < 0 || i >= nc) continue;
          const w = (di ? au : 1 - au) * wv;
          sum += this.scatterRate[(k * nc + j) * nc + i] * w;
        }
      }
    }
    return sum;
  }
  fillMaterials(shapes) {
    const n = this.n;
    this.mat.fill(MAT.AIR);
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const id = (k * n + j) * n + i;
          const p = this.voxelPoint(i, j, k, {});
          for (const s of shapes) {
            let inside = false;
            if (s.kind === 'ell') {
              const dx = (p.x - s.c.x) / s.r.x, dy = (p.y - s.c.y) / s.r.y, dz = (p.z - s.c.z) / s.r.z;
              inside = dx * dx + dy * dy + dz * dz <= 1;
            } else if (s.kind === 'sph') {
              const dx = p.x - s.c.x, dy = p.y - s.c.y, dz = p.z - s.c.z;
              inside = dx * dx + dy * dy + dz * dz <= s.r * s.r;
            } else if (s.kind === 'box') {
              inside = Math.abs(p.x - s.c.x) <= s.hx && Math.abs(p.y - s.c.y) <= s.hy && Math.abs(p.z - s.c.z) <= s.hz;
            }
            if (inside) { this.mat[id] = s.m; break; }
          }
        }
      }
    }
  }
  accumulate(dt, params, geom, ell) {
    const { kVp, mA, pwMs, fps, cine, fieldFrac } = params;
    const Y = outputMicroGyPerMas(kVp) / 1000;
    const mu = muWater(effectiveEnergy(kVp));
    const fieldAtDet = FIELD_MIN + (FIELD_MAX - FIELD_MIN) * fieldFrac;
    const bsf = backscatterFactor(kVp, fieldAtDet);
    const mAs = mA * (pwMs / 1000) * (cine ? 4 : 1);
    const nP = fps * dt;
    const src = geom.source, bd = geom.beamDir, sid = geom.sid;
    const r0 = 0.012, r1 = fieldAtDet / 2;
    const n = this.n;
    const p = { x: 0, y: 0, z: 0 };
    const dir = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          this.voxelPoint(i, j, k, p);
          const vx = p.x - src.x, vy = p.y - src.y, vz = p.z - src.z;
          const t = vx * bd.x + vy * bd.y + vz * bd.z;
          if (t <= 0.02 || t > sid + 0.3) continue;
          const lx = vx - t * bd.x, ly = vy - t * bd.y, lz = vz - t * bd.z;
          const r = Math.sqrt(lx * lx + ly * ly + lz * lz);
          const R = r0 + (r1 - r0) * (t / sid);
          if (r > R) continue;
          const edge = r > R * 0.85 ? (R - r) / (R * 0.15) : 1;
          const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
          dir.x = vx / d; dir.y = vy / d; dir.z = vz / d;
          const chord = chordThrough(src, dir, ell);
          const dose = Y * mAs * (1 / d) ** 2 * bsf * Math.exp(-mu * chord) * edge * nP;
          const id = (k * n + j) * n + i;
          this.data[id] += dose;
          if (this.data[id] > this.max) this.max = this.data[id];
        }
      }
    }
  }
  accumulateScatter(dt, params, geom) {
    const n = this.n, cell = this.cell;
    const { kVp, mA, pwMs, fps, cine } = params;
    const Y = outputMicroGyPerMas(kVp) / 1000;
    const muW = muWater(effectiveEnergy(kVp)) * 100;
    const muS = muWater(0.45 * kVp) * 100;
    const mAs = mA * (pwMs / 1000) * (cine ? 4 : 1);
    const spr = scatterFraction(kVp, geom.fieldAtDet);
    const src = geom.source, bd = geom.beamDir, sid = geom.sid;
    const r0 = 0.012, r1 = geom.fieldAtDet / 2;

    let ux = -bd.z, uy = 0, uz = bd.x;
    const ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; } else { ux /= ul; uy /= ul; uz /= ul; }
    const vx = bd.y * uz - bd.z * uy, vy = bd.z * ux - bd.x * uz, vz = bd.x * uy - bd.y * ux;

    const rMax = 0.85 * r1;
    const nRaysWant = Math.max(7, Math.min(49, Math.round(Math.PI * rMax * rMax / (cell * cell))));
    let nRings = 1;
    while (1 + 3 * nRings * (nRings + 1) < nRaysWant) nRings++;
    const rays = [[0, 0]];
    for (let ring = 1; ring <= nRings; ring++) {
      const rr = ring / nRings * 0.85, cnt = ring * 6;
      for (let a = 0; a < cnt; a++) {
        const th = (a / cnt) * 2 * Math.PI + ring * 0.7;
        rays.push([Math.cos(th) * rr, Math.sin(th) * rr]);
      }
    }
    const nRays = rays.length;

    const nG = this.n;
    const isSurface = id => {
      const i = id % nG, rest = (id / nG) | 0, j = rest % nG, k = (rest / nG) | 0;
      if (i > 0 && this.mat[id - 1] === MAT.AIR) return true;
      if (i < nG - 1 && this.mat[id + 1] === MAT.AIR) return true;
      if (j > 0 && this.mat[id - nG] === MAT.AIR) return true;
      if (j < nG - 1 && this.mat[id + nG] === MAT.AIR) return true;
      if (k > 0 && this.mat[id - nG * nG] === MAT.AIR) return true;
      if (k < nG - 1 && this.mat[id + nG * nG] === MAT.AIR) return true;
      return false;
    };

    const sources = [];
    const step = cell * 0.5;
    for (const [ox, oy] of rays) {
      let depth = 0, lastId = -1;
      for (let t = step; t < sid + 0.5; t += step) {
        const R = (r0 + (r1 - r0) * (t / sid)) * 0.85;
        const px = src.x + bd.x * t + (ux * ox + vx * oy) * R;
        const py = src.y + bd.y * t + (uy * ox + vy * oy) * R;
        const pz = src.z + bd.z * t + (uz * ox + vz * oy) * R;
        const id = this.voxelIndex(px, py, pz);
        if (id < 0) continue;
        const m = this.mat[id];
        if (m !== MAT.AIR && id !== lastId && sources.length < (n >= 80 ? 160 : 480)) {
          const prim = Y * mAs * (1 / t) ** 2 * Math.exp(-muW * depth) * fps;
          const f = (m === MAT.METAL ? 2.5 : 1) * (isSurface(id) ? 1.5 : 1);
          sources.push({ x: px, y: py, z: pz, power: prim * spr * f * (Math.PI * R * R / nRays) * cell / 0.3 });
          lastId = id;
        }
        if (m !== MAT.AIR && m !== MAT.METAL) depth += step;
      }
    }
    this.scatterRate.fill(0);
    if (!sources.length) return;

    const CAL = 1.0;
    const dirs = fibDirs(96);
    const maxRange = this.size * 0.6;
    const dMin = Math.max(0.15, this.cellC);
    const nc = this.nc, h = this.size / 2, cellC = this.cellC, c = this.center;
    const stepD = cell;
    const wStep = stepD / cellC;
    for (const s of sources) {
      for (const dr of dirs) {
        let pathMu = 0;
        for (let d = stepD; d < maxRange; d += stepD) {
          const px = s.x + dr.x * d, py = s.y + dr.y * d, pz = s.z + dr.z * d;
          const id = this.voxelIndex(px, py, pz);
          if (id < 0) break;
          pathMu += MAT_MU_SCALE[this.mat[id]] * muS * stepD;
          const dd = Math.max(d, dMin);
          const dep = s.power * CAL * Math.exp(-pathMu) * wStep / (4 * Math.PI * dd * dd);
          const fu = (px - c.x + h) / cellC - 0.5;
          const fv = (py - c.y + h) / cellC - 0.5;
          const fw = (pz - c.z + h) / cellC - 0.5;
          const i0 = Math.floor(fu), j0 = Math.floor(fv), k0 = Math.floor(fw);
          const au = fu - i0, av = fv - j0, aw = fw - k0;
          for (let dk = 0; dk <= 1; dk++) {
            const k = k0 + dk;
            if (k < 0 || k >= nc) continue;
            for (let dj = 0; dj <= 1; dj++) {
              const j = j0 + dj;
              if (j < 0 || j >= nc) continue;
              const wv = (dj ? av : 1 - av) * (dk ? aw : 1 - aw);
              for (let di = 0; di <= 1; di++) {
                const i = i0 + di;
                if (i < 0 || i >= nc) continue;
                this.scatterRate[(k * nc + j) * nc + i] += dep * (di ? au : 1 - au) * wv;
              }
            }
          }
        }
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      const srcA = this.scatterRate, dst = this.scatterTmp;
      for (let k = 0; k < nc; k++) {
        for (let j = 0; j < nc; j++) {
          for (let i = 0; i < nc; i++) {
            const id = (k * nc + j) * nc + i;
            let sum = srcA[id] * 4, wsum = 4;
            for (let dk = -1; dk <= 1; dk++) {
              const k2 = k + dk;
              if (k2 < 0 || k2 >= nc) continue;
              for (let dj = -1; dj <= 1; dj++) {
                const j2 = j + dj;
                if (j2 < 0 || j2 >= nc) continue;
                for (let di = -1; di <= 1; di++) {
                  if (!dk && !dj && !di) continue;
                  const i2 = i + di;
                  if (i2 < 0 || i2 >= nc) continue;
                  sum += srcA[(k2 * nc + j2) * nc + i2];
                  wsum += 1;
                }
              }
            }
            dst[id] = sum / wsum;
          }
        }
      }
      this.scatterRate.set(dst);
    }
    for (let pass = 0; pass < 6; pass++) {
      const srcA = this.scatterRate, dst = this.scatterTmp;
      let changed = false;
      for (let k = 0; k < nc; k++) {
        for (let j = 0; j < nc; j++) {
          for (let i = 0; i < nc; i++) {
            const id = (k * nc + j) * nc + i;
            if (srcA[id] > 0) { dst[id] = srcA[id]; continue; }
            let sum = 0, cnt = 0;
            if (i > 0 && srcA[id - 1] > 0) { sum += srcA[id - 1]; cnt++; }
            if (i < nc - 1 && srcA[id + 1] > 0) { sum += srcA[id + 1]; cnt++; }
            if (j > 0 && srcA[id - nc] > 0) { sum += srcA[id - nc]; cnt++; }
            if (j < nc - 1 && srcA[id + nc] > 0) { sum += srcA[id + nc]; cnt++; }
            if (k > 0 && srcA[id - nc * nc] > 0) { sum += srcA[id - nc * nc]; cnt++; }
            if (k < nc - 1 && srcA[id + nc * nc] > 0) { sum += srcA[id + nc * nc]; cnt++; }
            dst[id] = cnt ? 0.92 * sum / cnt : 0;
            if (dst[id] > 0) changed = true;
          }
        }
      }
      this.scatterRate.set(dst);
      if (!changed) break;
    }
    const refDirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
    for (const [dx, dy, dz] of refDirs) {
      const rx = c.x + dx, ry = c.y + dy, rz = c.z + dz;
      const rid = this.voxelIndex(rx, ry, rz);
      if (rid < 0 || this.mat[rid] !== MAT.AIR) continue;
      const refRaw = this.scatterRateAt(rx, ry, rz);
      if (refRaw > 0) {
        const scale = 0.01 * Y * mAs * fps / refRaw;
        for (let id = 0; id < this.scatterRate.length; id++) this.scatterRate[id] *= scale;
        break;
      }
    }
    const nc2 = this.nc, ratio = this.n / this.nc;
    for (let k = 0; k < nc2; k++) {
      for (let j = 0; j < nc2; j++) {
        for (let i = 0; i < nc2; i++) {
          const d = this.scatterRate[(k * nc2 + j) * nc2 + i] * dt;
          if (d <= 0) continue;
          const k0 = Math.round(k * ratio), j0 = Math.round(j * ratio), i0 = Math.round(i * ratio);
          for (let dk = 0; dk < ratio; dk++) {
            for (let dj = 0; dj < ratio; dj++) {
              for (let di = 0; di < ratio; di++) {
                const id = ((k0 + dk) * n + (j0 + dj)) * n + (i0 + di);
                this.data[id] += d;
                if (this.data[id] > this.max) this.max = this.data[id];
              }
            }
          }
        }
      }
    }
  }
  sample(axis, offset, m, opts = {}) {
    const rateMode = !!opts.rate;
    const params = opts.params, geom = opts.geom, ell = opts.ell;
    const roles = {
      x: { n: 0, u: 2, v: 1 },
      y: { n: 1, u: 0, v: 2 },
      z: { n: 2, u: 0, v: 1 }
    };
    const R = roles[axis];
    const n = this.n, h = this.size / 2, cell = this.cell, c = this.center;
    const axisVec = {
      x: { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      y: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      z: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }
    };
    const A = axisVec[axis];
    const out = new Float32Array(m * m);
    let max = 0;
    const idx = [0, 0, 0];
    const in0 = Math.max(0, Math.min(n - 1, Math.round((offset + h) / cell - 0.5)));
    for (let b = 0; b < m; b++) {
      for (let a = 0; a < m; a++) {
        const pa = (a + 0.5) / m * this.size - h;
        const pb = (b + 0.5) / m * this.size - h;
        const x = c.x + A.n[0] * offset + A.u[0] * pa + A.v[0] * pb;
        const y = c.y + A.n[1] * offset + A.u[1] * pa + A.v[1] * pb;
        const z = c.z + A.n[2] * offset + A.u[2] * pa + A.v[2] * pb;
        let val;
        if (rateMode) {
          val = cellDoseRate(params, geom, ell, x, y, z) + (opts.scatterLookup ? opts.scatterLookup(x, y, z) : 0);
        } else {
          const iu = Math.max(0, Math.min(n - 1.001, (pa + h) / cell - 0.5));
          const iv = Math.max(0, Math.min(n - 1.001, (pb + h) / cell - 0.5));
          const i0 = Math.floor(iu), j0 = Math.floor(iv);
          const fu = iu - i0, fv = iv - j0;
          const i1 = Math.min(n - 1, i0 + 1), j1 = Math.min(n - 1, j0 + 1);
          idx[R.n] = in0;
          idx[R.u] = i0; idx[R.v] = j0;
          const v00 = this.data[(idx[2] * n + idx[1]) * n + idx[0]];
          idx[R.u] = i1;
          const v10 = this.data[(idx[2] * n + idx[1]) * n + idx[0]];
          idx[R.u] = i0; idx[R.v] = j1;
          const v01 = this.data[(idx[2] * n + idx[1]) * n + idx[0]];
          idx[R.u] = i1;
          const v11 = this.data[(idx[2] * n + idx[1]) * n + idx[0]];
          val = (v00 * (1 - fu) + v10 * fu) * (1 - fv) + (v01 * (1 - fu) + v11 * fu) * fv;
        }
        out[b * m + a] = val;
        if (val > max) max = val;
      }
    }
    return { data: out, max };
  }
}

export function cellDoseRate(params, geom, ell, x, y, z) {
  const { kVp, mA, pwMs, fps, cine, fieldFrac } = params;
  const Y = outputMicroGyPerMas(kVp) / 1000;
  const mu = muWater(effectiveEnergy(kVp));
  const fieldAtDet = FIELD_MIN + (FIELD_MAX - FIELD_MIN) * fieldFrac;
  const bsf = backscatterFactor(kVp, fieldAtDet);
  const mAs = mA * (pwMs / 1000) * (cine ? 4 : 1);
  const src = geom.source, bd = geom.beamDir, sid = geom.sid;
  const vx = x - src.x, vy = y - src.y, vz = z - src.z;
  const t = vx * bd.x + vy * bd.y + vz * bd.z;
  if (t <= 0.02) return 0;
  const lx = vx - t * bd.x, ly = vy - t * bd.y, lz = vz - t * bd.z;
  const r = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const R = 0.012 + (fieldAtDet / 2 - 0.012) * (t / sid);
  if (r > R) return 0;
  const edge = r > R * 0.85 ? (R - r) / (R * 0.15) : 1;
  const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const chord = chordThrough(src, { x: vx / d, y: vy / d, z: vz / d }, ell);
  return Y * mAs * (1 / d) ** 2 * bsf * Math.exp(-mu * chord) * edge * fps;
}

export class DoseSim {
  constructor() {
    this.reset();
  }
  attachSkin(count) {
    this.skinDoses = new Float32Array(count);
  }
  reset() {
    if (this.skinDoses) this.skinDoses.fill(0);
    this.kaR_mGy = 0;
    this.dap_Gycm2 = 0;
    this.time_s = 0;
    this.pulses = 0;
    this.rate_mGy_s = 0;
    this.peak_mGy = 0;
    this.peakIdx = -1;
  }
  accumulate(dt, params, geom, skin, tableY, ellipsoidsWorld, scatterLookup = null) {
    const { kVp, mA, pwMs, fps, cine, fieldFrac } = params;
    const Y = outputMicroGyPerMas(kVp) / 1000;
    const mu = muWater(effectiveEnergy(kVp));
    const fieldAtDet = FIELD_MIN + (FIELD_MAX - FIELD_MIN) * fieldFrac;
    const bsf = backscatterFactor(kVp, fieldAtDet);
    const mAs = mA * (pwMs / 1000) * (cine ? 4 : 1);
    const nPulses = fps * dt;
    const kaIrp_pulse = Y * mAs * (1 / geom.dSrcIrp) ** 2 * geom.scatter;
    const scatIrp = scatterLookup ? scatterLookup(geom.irp.x, geom.irp.y, geom.irp.z) / fps : 0;
    this.kaR_mGy += (kaIrp_pulse + scatIrp) * nPulses;
    this.rate_mGy_s = (kaIrp_pulse + scatIrp) * fps;

    const fieldAtIso = fieldAtDet * (geom.dSrcIso / geom.sid);
    const areaIso_cm2 = fieldAtIso * fieldAtIso * 1e4;
    const kaIso_pulse = Y * mAs * (1 / geom.dSrcIso) ** 2;
    this.dap_Gycm2 += (kaIso_pulse / 1000) * areaIso_cm2 * nPulses;

    this.time_s += dt;
    this.pulses += nPulses;

    const n = skin.n;
    const pos = skin.pos;
    const nor = skin.nor;
    const src = geom.source;
    const bd = geom.beamDir;
    const r0 = 0.012;
    const r1 = fieldAtDet / 2;
    const sid = geom.sid;
    let peak = 0;
    let peakIdx = -1;
    for (let i = 0; i < n; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1] + tableY, pz = pos[i * 3 + 2];
      const vx = px - src.x, vy = py - src.y, vz = pz - src.z;
      const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (d < 0.05) continue;
      const t = vx * bd.x + vy * bd.y + vz * bd.z;
      if (t <= 0.02) continue;
      const lx = vx - t * bd.x, ly = vy - t * bd.y, lz = vz - t * bd.z;
      const r = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const R = r0 + (r1 - r0) * (t / sid);
      const edge = r > R ? 0 : (r > R * 0.85 ? (R - r) / (R * 0.15) : 1);
      const facing = -(nor[i * 3] * bd.x + nor[i * 3 + 1] * bd.y + nor[i * 3 + 2] * bd.z);
      const entrance = facing >= 0.05;
      if (entrance) {
        const ka = Y * mAs * (1 / d) ** 2 * bsf * edge * nPulses;
        this.skinDoses[i] += ka;
      }
      if (scatterLookup) {
        this.skinDoses[i] += scatterLookup(px, py, pz) * dt;
      }
      if (this.skinDoses[i] > peak) {
        peak = this.skinDoses[i];
        peakIdx = i;
      }
    }
    if (peak > this.peak_mGy) {
      this.peak_mGy = peak;
      this.peakIdx = peakIdx;
    }

  }
}
