import * as THREE from 'three';
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISO, SID, TABLE_BASE, AORTA_POINTS, OSTIUM, LM_POINTS, LAD_POINTS, LCX_POINTS, RCA_POINTS, sampleEllipsoid
} from '../src/world.js';
import { DoseSim, DoseField, computeBeamGeometry, colormap, colormapRoom, colormapCloud, ROOM_SCALE_GY, PLANE_SIZE, MAT } from '../src/dose.js';

const W = Number(process.env.PREVIEW_W || 1280);
const H = Number(process.env.PREVIEW_H || 800);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'docs'), { recursive: true });

const px = new Float32Array(W * H * 4);
const zb = new Float32Array(W * H).fill(Infinity);
for (let i = 0; i < W * H; i++) {
  const y = (i / W) | 0;
  const g = 0.05 + 0.03 * (1 - y / H);
  px[i * 4] = g * 0.7; px[i * 4 + 1] = g * 0.85; px[i * 4 + 2] = g * 1.4; px[i * 4 + 3] = 1;
}

const cam = new THREE.PerspectiveCamera(45, W / H, 0.05, 60);
cam.position.set(2.0, 1.8, 2.45);
cam.lookAt(0, 0.95, -0.35);
cam.updateMatrixWorld(true);
const view = cam.matrixWorldInverse.clone();
const proj = cam.projectionMatrix.clone();
const tanHalf = Math.tan(THREE.MathUtils.degToRad(45) / 2);

function project(p) {
  const v = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(view).applyMatrix4(proj);
  if (v.w <= 0.001) return null;
  return { x: (v.x / v.w * 0.5 + 0.5) * W, y: (1 - (v.y / v.w * 0.5 + 0.5)) * H, z: v.z / v.w };
}

function setPx(x, y, z, r, g, b, a, zWrite = true) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = ((y | 0) * W + (x | 0));
  if (z > zb[i] + 1e-6) return;
  if (zWrite) zb[i] = z;
  const j = i * 4;
  px[j] = px[j] * (1 - a) + r * a;
  px[j + 1] = px[j + 1] * (1 - a) + g * a;
  px[j + 2] = px[j + 2] * (1 - a) + b * a;
  px[j + 3] = 1;
}

const L = new THREE.Vector3(3, 5, 2.5).normalize();

function tri(a, b, c, col, alpha = 1, zWrite = true) {
  const pa = project(a), pb = project(b), pc = project(c);
  if (!pa || !pb || !pc) return;
  const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  const s = 0.35 + 0.65 * Math.max(0, n.dot(L));
  const r = col[0] * s, g = col[1] * s, b2 = col[2] * s;
  const minX = Math.max(0, Math.floor(Math.min(pa.x, pb.x, pc.x)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(pa.x, pb.x, pc.x)));
  const minY = Math.max(0, Math.floor(Math.min(pa.y, pb.y, pc.y)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(pa.y, pb.y, pc.y)));
  const d = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
  if (Math.abs(d) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((pb.x - pa.x) * (y - pa.y) - (x - pa.x) * (pb.y - pa.y)) / d;
      const w1 = ((pc.x - pa.x) * (y - pa.y) - (x - pa.x) * (pc.y - pa.y)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
      const z = w0 * pa.z + w1 * pb.z + w2 * pc.z;
      setPx(x, y, z, r, g, b2, alpha, zWrite);
    }
  }
}

function line(a, b, rPx, col, alpha = 1, zWrite = true) {
  const pa = project(a), pb = project(b);
  if (!pa || !pb) return;
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = -dy / len * rPx, ny = dx / len * rPx;
  const z = (pa.z + pb.z) / 2;
  triRaw([pa.x + nx, pa.y + ny, z], [pa.x - nx, pa.y - ny, z], [pb.x - nx, pb.y - ny, z], col, alpha, zWrite);
  triRaw([pa.x + nx, pa.y + ny, z], [pb.x - nx, pb.y - ny, z], [pb.x + nx, pb.y + ny, z], col, alpha, zWrite);
}

function triRaw(a, b, c, col, alpha, zWrite) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(d) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d;
      const w1 = ((c[0] - a[0]) * (y - a[1]) - (x - a[0]) * (c[1] - a[1])) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
      setPx(x, y, w0 * a[2] + w1 * b[2] + w2 * c[2], col[0], col[1], col[2], alpha, zWrite);
    }
  }
}

function circle(p, rPx, col, alpha = 1) {
  const pp = project(p);
  if (!pp) return;
  for (let y = -rPx; y <= rPx; y++) {
    for (let x = -rPx; x <= rPx; x++) {
      if (x * x + y * y > rPx * rPx) continue;
      setPx(pp.x + x, pp.y + y, pp.z, col[0], col[1], col[2], alpha, false);
    }
  }
}

function sphereMesh(center, radii, seg, col, alpha = 1, zWrite = true) {
  const geo = new THREE.SphereGeometry(1, seg, Math.max(8, seg / 2));
  const pos = geo.attributes.position.array;
  const idx = geo.index.array;
  const v = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i] * radii.x + center.x, pos[i + 1] * radii.y + center.y, pos[i + 2] * radii.z + center.z);
    pts.push(v.clone());
  }
  for (let i = 0; i < idx.length; i += 3) {
    tri(pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]], col, alpha, zWrite);
  }
}

function box(center, sx, sy, sz, rot, col, alpha = 1) {
  const c = [];
  for (const [dx, dy, dz] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
    const p = new THREE.Vector3(dx * sx / 2, dy * sy / 2, dz * sz / 2);
    if (rot) p.applyMatrix4(rot);
    c.push(p.add(center));
  }
  const F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  for (const f of F) {
    tri(c[f[0]], c[f[1]], c[f[2]], col, alpha);
    tri(c[f[0]], c[f[2]], c[f[3]], col, alpha);
  }
}

const RAO = 25, CRAN = -10;
const TY = TABLE_BASE;
const R = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(RAO))
  .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(CRAN)));
const lw = p => ISO.clone().add(new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(R));

const floor = new THREE.Mesh();
tri(new THREE.Vector3(-12, 0, -12), new THREE.Vector3(12, 0, -12), new THREE.Vector3(12, 0, 12), [0.066, 0.10, 0.18], 1, true);
tri(new THREE.Vector3(-12, 0, -12), new THREE.Vector3(12, 0, 12), new THREE.Vector3(-12, 0, 12), [0.066, 0.10, 0.18], 1, true);
for (let i = -6; i <= 6; i++) {
  line(new THREE.Vector3(i * 0.5, 0.002, -6), new THREE.Vector3(i * 0.5, 0.002, 6), 1, [0.09, 0.13, 0.23], 0.9);
  line(new THREE.Vector3(-6, 0.002, i * 0.5), new THREE.Vector3(6, 0.002, i * 0.5), 1, [0.09, 0.13, 0.23], 0.9);
}

const steel = [0.35, 0.42, 0.52];
box(new THREE.Vector3(-1.05, 0.5, -0.35), 0.24, 1.0, 0.24, null, steel);
box(new THREE.Vector3(-0.52, 1.0, -0.35), 1.15, 0.14, 0.14, null, steel);
box(new THREE.Vector3(0, TY - 0.035, 0), 0.56, 0.07, 2.15, null, [0.20, 0.25, 0.33]);
box(new THREE.Vector3(0, TY - 0.47, 0), 0.3, 0.8, 0.45, null, steel);

const arcPts = [];
for (let i = 0; i <= 60; i++) {
  const a = Math.PI / 2 + (i / 60) * Math.PI;
  arcPts.push(lw([Math.cos(a) * SID / 2, Math.sin(a) * SID / 2, 0]));
}
for (let i = 0; i < arcPts.length - 1; i++) line(arcPts[i], arcPts[i + 1], 5, steel);
const srcW = lw([0, -SID / 2, 0]);
box(srcW, 0.17, 0.15, 0.17, R, [0.45, 0.52, 0.62]);
box(lw([0, SID / 2, 0]), 0.46, 0.07, 0.46, R, steel);

const torsoC = new THREE.Vector3(0, 0.14 + TY, -0.02);
const torsoR = new THREE.Vector3(0.2, 0.14, 0.58);
const headC = new THREE.Vector3(0.02, 0.17 + TY, -0.72);
const headR = new THREE.Vector3(0.115, 0.125, 0.14);
const skin = [0.49, 0.83, 0.99];
const bone = [0.91, 0.90, 0.85];
const brain = [0.94, 0.69, 0.99];

const heartC = new THREE.Vector3(0.035, 0.1 + TY, -0.43);
sphereMesh(heartC, new THREE.Vector3(0.085, 0.077, 0.081), 20, [0.72, 0.11, 0.11]);
sphereMesh(headC, headR.clone().multiplyScalar(1.18), 20, bone, 0.28, false);
sphereMesh(headC, headR.clone().multiplyScalar(0.72), 18, brain, 0.5, false);

const toV3 = list => list.map(p => new THREE.Vector3(p[0], p[1] + TY, p[2]));
const curvePts = list => new THREE.CatmullRomCurve3(toV3(list), false, 'centripetal').getPoints(80);
function drawCurve(pts, rPx, col, alpha = 1) {
  for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1], rPx, col, alpha);
}
const vesselCol = [0.95, 0.15, 0.32];
drawCurve(curvePts(AORTA_POINTS), 5.5, vesselCol);
for (const p of [LM_POINTS, LAD_POINTS, LCX_POINTS, RCA_POINTS]) drawCurve(curvePts(p), 3.5, vesselCol);
const guidePts = curvePts(AORTA_POINTS.concat(LM_POINTS.slice(1), LAD_POINTS.slice(1)));
drawCurve(guidePts.slice(0, Math.floor(guidePts.length * 0.97)), 1.8, [0.62, 0.66, 0.72]);
const cathPts = curvePts(AORTA_POINTS);
drawCurve(cathPts.slice(0, Math.floor(cathPts.length * 0.85)), 3.5, [0.97, 0.98, 1.0]);
const contrastPts = curvePts(LM_POINTS.concat(LAD_POINTS.slice(1)));
drawCurve(contrastPts.slice(0, Math.floor(contrastPts.length * 0.6)), 5, [1.0, 0.95, 0.78], 0.95);

sphereMesh(torsoC, torsoR, 36, skin, 0.45, false);
sphereMesh(headC, headR, 24, skin, 0.45, false);
for (const sx of [-1, 1]) {
  line(new THREE.Vector3(sx * 0.085, 0.055 + TY, 0.4), new THREE.Vector3(sx * 0.085, 0.055 + TY, 0.9), 7, skin, 0.45, false);
  line(new THREE.Vector3(sx * 0.235, 0.06 + TY, -0.27), new THREE.Vector3(sx * 0.235, 0.06 + TY, 0.17), 5, skin, 0.45, false);
}

const bd = new THREE.Vector3(0, 1, 0).applyMatrix4(R).normalize();
const ellPrev = [
  { c: torsoC, r: torsoR, mu: 1 },
  { c: headC, r: headR, mu: 1 },
  { c: headC, r: headR.clone().multiplyScalar(1.18), mu: 1.9 },
  { c: new THREE.Vector3(0, -0.05 + TY, 0), r: new THREE.Vector3(0.28, 0.05, 1.05), mu: 1 }
];
const geom = computeBeamGeometry(srcW, bd, ISO, SID, ellPrev, 0.7);
const sim = new DoseSim();
const torsoS = sampleEllipsoid(new THREE.Vector3(0, 0.14, -0.02), new THREE.Vector3(0.2, 0.14, 0.58), 1400);
const headS = sampleEllipsoid(new THREE.Vector3(0.02, 0.17, -0.72), new THREE.Vector3(0.115, 0.125, 0.14), 300);
const nPts = 1700;
const skinPos = new Float32Array(nPts * 3);
const skinNor = new Float32Array(nPts * 3);
skinPos.set(torsoS.pos); skinPos.set(headS.pos, 1400 * 3);
skinNor.set(torsoS.nor); skinNor.set(headS.nor, 1400 * 3);
sim.attachSkin(nPts);
const params = { kVp: 81, mA: 50, pwMs: 4, fps: 15, cine: true, fieldFrac: 0.7 };
for (let s = 0; s < 300; s++) sim.accumulate(1, params, geom, { n: nPts, pos: skinPos, nor: skinNor }, TY, ellPrev);

const det = srcW.clone().addScaledVector(bd, SID);
const half = geom.fieldAtDet / 2;
let u = new THREE.Vector3().crossVectors(bd, new THREE.Vector3(0, 0, 1));
if (u.lengthSq() < 1e-6) u = new THREE.Vector3().crossVectors(bd, new THREE.Vector3(1, 0, 0));
u.normalize();
const vv = new THREE.Vector3().crossVectors(bd, u).normalize();
const beamCol = [1.0, 0.82, 0.45];
for (const w of [u, vv]) {
  tri(srcW.clone().addScaledVector(w, 0.012), srcW.clone().addScaledVector(w, -0.012),
    det.clone().addScaledVector(w, -half), beamCol, 0.13, false);
  tri(srcW.clone().addScaledVector(w, 0.012), det.clone().addScaledVector(w, -half),
    det.clone().addScaledVector(w, half), beamCol, 0.13, false);
}

const field = new DoseField(ISO);
field.fillMaterials([
  { kind: 'ell', c: { x: torsoC.x, y: torsoC.y, z: torsoC.z }, r: { x: torsoR.x, y: torsoR.y, z: torsoR.z }, m: MAT.WATER },
  { kind: 'ell', c: { x: headC.x, y: headC.y, z: headC.z }, r: { x: headR.x, y: headR.y, z: headR.z }, m: MAT.WATER },
  { kind: 'ell', c: { x: headC.x, y: headC.y, z: headC.z }, r: { x: headR.x * 1.18, y: headR.y * 1.18, z: headR.z * 1.18 }, m: MAT.BONE },
  { kind: 'ell', c: { x: 0, y: -0.05 + TY, z: 0 }, r: { x: 0.28, y: 0.05, z: 1.05 }, m: MAT.TABLE },
  { kind: 'sph', c: { x: srcW.x, y: srcW.y, z: srcW.z }, r: 0.13, m: MAT.METAL },
  { kind: 'sph', c: { x: det.x, y: det.y, z: det.z }, r: 0.26, m: MAT.METAL }
]);
for (let s = 0; s < 1800; s++) {
  field.accumulate(1, params, geom, ellPrev);
  if (s % 10 === 9) field.accumulateScatter(10, params, geom);
}
{
  const n = field.n, h = field.size / 2, cell = field.size / n;
  const cc = [0, 0, 0];
  const scaleUSv = 2000;
  let drawnC = 0;
  for (let id = 0; id < n ** 3 && drawnC < 1600; id++) {
    const d = field.data[id];
    if (d * 1000 < 0.02 * scaleUSv) continue;
    const k = Math.floor(id / (n * n)), j = Math.floor(id / n) % n, i = id % n;
    const p = new THREE.Vector3(ISO.x - h + (i + 0.5) * cell, ISO.y - h + (j + 0.5) * cell, ISO.z - h + (k + 0.5) * cell);
    const t = Math.min(1, (d * 1000) / scaleUSv);
    colormapCloud(t, cc);
    circle(p, 2.2, cc, 0.06 + 0.94 * t);
    drawnC++;
  }
  console.error('cloud points drawn:', drawnC);
}
const PM = 40;
const samp = field.sample('x', 0, PM);
const fh = PLANE_SIZE / 2, fcell = PLANE_SIZE / PM;
const planeCol = [0.96, 0.97, 0.99];
for (let b = 0; b < PM; b++) {
  for (let a = 0; a < PM; a++) {
    const y0 = ISO.y - fh + b * fcell, y1 = y0 + fcell;
    const z0 = ISO.z - fh + a * fcell, z1 = z0 + fcell;
    tri(new THREE.Vector3(0, y0, z0), new THREE.Vector3(0, y1, z0), new THREE.Vector3(0, y1, z1), planeCol, 0.16, false);
    tri(new THREE.Vector3(0, y0, z0), new THREE.Vector3(0, y1, z1), new THREE.Vector3(0, y0, z1), planeCol, 0.16, false);
    const v = samp.data[b * PM + a];
    if (v <= 20) continue;
    const t = v / 1000 / ROOM_SCALE_GY;
    const cc = [0, 0, 0];
    colormapRoom(t, cc);
    const alpha = 0.3 + 0.65 * Math.min(1, t);
    tri(new THREE.Vector3(0, y0, z0), new THREE.Vector3(0, y1, z0), new THREE.Vector3(0, y1, z1), cc, alpha, false);
    tri(new THREE.Vector3(0, y0, z0), new THREE.Vector3(0, y1, z1), new THREE.Vector3(0, y0, z1), cc, alpha, false);
  }
}

const c = [0, 0, 0];
let drawn = 0;
for (let i = 0; i < nPts; i++) {
  const d = sim.skinDoses[i];
  if (d < 0.05) continue;
  colormap(d / 1000 / 5, c);
  circle(new THREE.Vector3(skinPos[i * 3], skinPos[i * 3 + 1] + TY, skinPos[i * 3 + 2]), 3.4, c, 0.95);
  drawn++;
}

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c2 = n;
      for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 0xedb88320 ^ (c2 >>> 1) : c2 >>> 1;
      table[n] = c2;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  for (let x = 0; x < W; x++) {
    const j = (y * W + x) * 4, o = y * (1 + W * 4) + 1 + x * 4;
    for (let k = 0; k < 3; k++) {
      const c = Math.min(1, px[j + k] * 2.0);
      raw[o + k] = Math.max(0, Math.min(255, Math.pow(c, 1 / 2.2) * 255));
    }
    raw[o + 3] = 255;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
const outPath = process.env.PREVIEW_OUT || join(root, 'docs', 'preview.png');
writeFileSync(outPath, png);
console.log(`preview written: ${outPath} (${(png.length / 1024).toFixed(0)} kB), dose points drawn: ${drawn}, Ka,r=${sim.kaR_mGy.toFixed(0)} mGy, peak=${(sim.peak_mGy / 1000).toFixed(2)} Gy, DAP=${sim.dap_Gycm2.toFixed(1)} Gy*cm2`);
