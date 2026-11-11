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

export function backscatterFactor(kVp) {
  return 1.28 + 0.12 * (kVp - 60) / 60;
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
      total += Math.max(0, hit[1] - Math.max(0, hit[0]));
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
export const FIELD_SIZE = 1.32;
export const FIELD_N = 44;

export class DoseField {
  constructor(center) {
    this.n = FIELD_N;
    this.size = FIELD_SIZE;
    this.center = center.clone();
    this.cell = this.size / this.n;
    this.data = new Float32Array(this.n ** 3);
    this.max = 0;
  }
  reset() {
    this.data.fill(0);
    this.max = 0;
  }
  voxelPoint(i, j, k, out) {
    const h = this.size / 2, c = this.center, cell = this.cell;
    out.x = c.x - h + (i + 0.5) * cell;
    out.y = c.y - h + (j + 0.5) * cell;
    out.z = c.z - h + (k + 0.5) * cell;
    return out;
  }
  accumulate(dt, params, geom, ell) {
    const { kVp, mA, pwMs, fps, cine, fieldFrac } = params;
    const Y = outputMicroGyPerMas(kVp) / 1000;
    const mu = muWater(effectiveEnergy(kVp));
    const bsf = backscatterFactor(kVp);
    const mAs = mA * (pwMs / 1000) * (cine ? 4 : 1);
    const nP = fps * dt;
    const fieldAtDet = FIELD_MIN + (FIELD_MAX - FIELD_MIN) * fieldFrac;
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
  sample(axis, offset, m, opts = {}) {
    const rateMode = !!opts.rate;
    const params = opts.params, geom = opts.geom, ell = opts.ell;
    const axes = {
      x: { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      y: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      z: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }
    };
    const A = axes[axis];
    const n = this.n, h = this.size / 2, cell = this.cell, c = this.center;
    const out = new Float32Array(m * m);
    let max = 0;
    for (let b = 0; b < m; b++) {
      for (let a = 0; a < m; a++) {
        const pa = (a + 0.5) / m * this.size - h;
        const pb = (b + 0.5) / m * this.size - h;
        const x = c.x + A.n[0] * offset + A.u[0] * pa + A.v[0] * pb;
        const y = c.y + A.n[1] * offset + A.u[1] * pa + A.v[1] * pb;
        const z = c.z + A.n[2] * offset + A.u[2] * pa + A.v[2] * pb;
        const i = Math.max(0, Math.min(n - 1, Math.floor((x - c.x + h) / cell)));
        const j = Math.max(0, Math.min(n - 1, Math.floor((y - c.y + h) / cell)));
        const k = Math.max(0, Math.min(n - 1, Math.floor((z - c.z + h) / cell)));
        let val;
        if (rateMode) {
          val = cellDoseRate(params, geom, ell, x, y, z);
        } else {
          val = this.data[(k * n + j) * n + i];
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
  const bsf = backscatterFactor(kVp);
  const mAs = mA * (pwMs / 1000) * (cine ? 4 : 1);
  const fieldAtDet = FIELD_MIN + (FIELD_MAX - FIELD_MIN) * fieldFrac;
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
  accumulate(dt, params, geom, skin, tableY, ellipsoidsWorld) {
    const { kVp, mA, pwMs, fps, cine, fieldFrac } = params;
    const Y = outputMicroGyPerMas(kVp) / 1000;
    const mu = muWater(effectiveEnergy(kVp));
    const bsf = backscatterFactor(kVp);
    const mAs = mA * (pwMs / 1000) * (cine ? 4 : 1);
    const nPulses = fps * dt;
    const fieldAtDet = FIELD_MIN + (FIELD_MAX - FIELD_MIN) * fieldFrac;

    const kaIrp_pulse = Y * mAs * (1 / geom.dSrcIrp) ** 2 * geom.scatter;
    this.kaR_mGy += kaIrp_pulse * nPulses;
    this.rate_mGy_s = kaIrp_pulse * fps;

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
      if (r > R) continue;
      const edge = r > R * 0.85 ? (R - r) / (R * 0.15) : 1;
      const facing = -(nor[i * 3] * bd.x + nor[i * 3 + 1] * bd.y + nor[i * 3 + 2] * bd.z);
      if (facing < 0.05) continue;
      const ka = Y * mAs * (1 / d) ** 2 * bsf * edge * nPulses;
      this.skinDoses[i] += ka;
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
