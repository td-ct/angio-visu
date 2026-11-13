import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld, ISO, SID, TABLE_BASE } from './world.js';
import { DoseSim, DoseField, computeBeamGeometry, colormap, SKIN_SCALE_GY, cellDoseRate, MAT, PLANE_SIZE } from './dose.js';
import { state, initUI, doseParams, updateReadouts, Chart, drawSkinMap } from './ui.js';
import { openPlaneSnapshot } from './snapshot.js';

const container = document.getElementById('scene');
const errbox = document.getElementById('errbox');
function showErr(msg) {
  errbox.style.display = 'block';
  errbox.textContent = 'Visualisierung konnte nicht starten:\n' + msg;
}
window.addEventListener('error', e => showErr(e.message || String(e.error)));
window.addEventListener('unhandledrejection', e => showErr((e.reason && e.reason.message) || String(e.reason)));

const probe = document.createElement('canvas');
if (!probe.getContext('webgl2') && !probe.getContext('webgl')) {
  showErr('WebGL ist in diesem Browser nicht verfügbar.\nHardwarebeschleunigung aktivieren oder anderen Browser verwenden.\n(Tipp: die fertige Single-File-App "angio-visu.html" im Repo-Root per Doppelklick öffnen, nicht die Quell-index.html.)');
}
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(1.9, 1.7, 2.3);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, -0.3);
controls.enableDamping = true;
controls.maxDistance = 8;
controls.minDistance = 0.4;

const world = buildWorld(scene);
const sim = new DoseSim();
sim.attachSkin(world.nPts);
let isoVec = ISO.clone();
let field = new DoseField(isoVec);
world.setIso(isoVec);

function materialShapes() {
  const o = world.tableOff;
  const ty = world.tableY;
  const shapes = [];
  for (const l of world.ellipsoidsLocal) {
    const m = (l.mu ?? 1) > 1.5 ? MAT.BONE : (l.c.y < 0 ? MAT.TABLE : MAT.WATER);
    shapes.push({ kind: 'ell', c: { x: l.c.x + o.x, y: l.c.y + ty, z: l.c.z + o.z }, r: l.r, m });
  }
  for (const sx of [-1, 1]) {
    shapes.push({ kind: 'ell', c: { x: sx * 0.085 + o.x, y: 0.055 + ty, z: 0.65 + o.z }, r: { x: 0.062, y: 0.062, z: 0.28 }, m: MAT.WATER });
    shapes.push({ kind: 'ell', c: { x: sx * 0.235 + o.x, y: 0.06 + ty, z: -0.05 + o.z }, r: { x: 0.042, y: 0.042, z: 0.24 }, m: MAT.WATER });
  }
  const sw = world.getSourceWorld(new THREE.Vector3());
  world.gantry.updateMatrixWorld(true);
  const dw = new THREE.Vector3(0, SID / 2, 0).applyMatrix4(world.gantry.matrixWorld);
  shapes.push({ kind: 'sph', c: { x: sw.x, y: sw.y, z: sw.z }, r: 0.13, m: MAT.METAL });
  shapes.push({ kind: 'sph', c: { x: dw.x, y: dw.y, z: dw.z }, r: 0.26, m: MAT.METAL });
  for (let a = 0; a < 4; a++) {
    const ang = Math.PI / 2 + (a + 0.5) / 4 * Math.PI;
    const lp = new THREE.Vector3(Math.cos(ang) * SID / 2, Math.sin(ang) * SID / 2, 0).applyMatrix4(world.gantry.matrixWorld).add(isoVec);
    shapes.push({ kind: 'sph', c: { x: lp.x, y: lp.y, z: lp.z }, r: 0.055, m: MAT.METAL });
  }
  shapes.push({ kind: 'box', c: { x: -1.05, y: 0.5, z: -0.35 }, hx: 0.12, hy: 0.5, hz: 0.12, m: MAT.METAL });
  shapes.push({ kind: 'box', c: { x: -0.775, y: 1.0, z: -0.35 }, hx: 0.275, hy: 0.07, hz: 0.07, m: MAT.METAL });
  shapes.push({ kind: 'box', c: { x: 0, y: ty - 0.47, z: 0 }, hx: 0.15, hy: Math.max(0.05, ty / 2), hz: 0.225, m: MAT.METAL });
  return shapes;
}

let lastGeomKey = '';
function refreshMaterialsIfDirty() {
  const key = [smooth.rao, smooth.cran, smooth.table, world.tableOff.x, world.tableOff.z].map(v => v.toFixed(3)).concat(state.mode).join('|');
  if (key !== lastGeomKey) {
    lastGeomKey = key;
    field.center.copy(isoVec);
    field.fillMaterials(materialShapes());
  }
}

function rebuildField() {
  const n = Math.round(4.0 / (state.fieldRes / 100));
  field = new DoseField(isoVec, n);
  field.fillMaterials(materialShapes());
  world.rebuildCloud(n);
  world.updateCloud(field, fieldOpts(1000), null);
}
let lastMode = state.mode;

function fieldOpts(planeMaxUnit) {
  const isRate = state.fieldQuantity === 'rate';
  const unitFactor = isRate ? 3600 : 1000;
  const scaleMin = state.scaleMin;
  const scaleMax = state.scaleLock ? state.scaleMax : Math.max(planeMaxUnit, scaleMin + 1e-6);
  return {
    unitFactor,
    scaleMin,
    scaleMax,
    cmap: state.cmap,
    log: state.logScale,
    unit: isRate ? 'mSv/h' : 'µSv'
  };
}

function applyMode() {
  isoVec = state.mode === 'neuro' ? new THREE.Vector3(0.02, 1.0, -0.72) : ISO.clone();
  world.setIso(isoVec);
  field.center.copy(isoVec);
  world.setAnatomyMode(state.mode);
  controls.target.copy(isoVec);
  sim.reset();
  field.reset();
  chart.reset();
  refreshSkinColors();
  world.updateCloud(field, fieldOpts(1000), null);
  world.drawPlane(new Float32Array(world.PLANE_M * world.PLANE_M), world.PLANE_M, fieldOpts(1000));
  drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
}

const chart = new Chart(document.getElementById('chart'));
const skinCanvas = document.getElementById('skinmap');

const smooth = {
  rao: 0, cran: 0, table: 0, cath: 0
};
const contrast = { phase: 'idle', t: 0 };

const ellipsoidsWorld = world.ellipsoidsLocal.map(e => ({ c: e.c.clone(), r: e.r.clone() }));

function ellipsoidsAt(tableY) {
  const o = world.tableOff;
  for (let i = 0; i < ellipsoidsWorld.length; i++) {
    const l = world.ellipsoidsLocal[i];
    ellipsoidsWorld[i].c.set(l.c.x + o.x, l.c.y + tableY, l.c.z + o.z);
    ellipsoidsWorld[i].mu = l.mu;
  }
  return ellipsoidsWorld;
}

function currentTableY() {
  return TABLE_BASE + smooth.table / 100;
}

const srcV = new THREE.Vector3();
const dirV = new THREE.Vector3();
let lastGeom = null, lastParams = null, lastEll = null;
let lastRes = 8;
const ELL_NAMES = ['Schädelknochen', 'Wirbelsäule', 'Rippe', 'Rippe', 'Rippe', 'Rippe', 'Becken', 'Weichteil (Wasser)', 'Weichteil (Wasser)', 'Tischplatte'];
const PLANE_LABELS = { carm: 'C-Bogen-Ebene', lie: 'liegend (Tischachse)', steh: 'stehend (Tischachse)' };

function planePose() {
  const off = new THREE.Vector3(state.planeOffX / 100, state.planeOffY / 100, state.planeOffZ / 100);
  let n;
  if (state.planePreset === 'carm') {
    world.gantry.updateMatrixWorld(true);
    const g = new THREE.Vector3();
    world.gantry.getWorldPosition(g);
    n = new THREE.Vector3(0, 0, 1).applyMatrix4(world.gantry.matrixWorld).sub(g).normalize();
  } else if (state.planePreset === 'lie') {
    n = new THREE.Vector3(0, 1, 0);
  } else {
    n = new THREE.Vector3(1, 0, 0);
  }
  const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(state.planeRotX),
    THREE.MathUtils.degToRad(state.planeRotY),
    THREE.MathUtils.degToRad(state.planeRotZ), 'XYZ'));
  return { off, quat: qAlign.multiply(qTilt) };
}
let lastPoseKey = '';

function refreshSkinColors() {
  const colors = world.skinPoints.geometry.attributes.color;
  const c = [0, 0, 0];
  for (let i = 0; i < world.nPts; i++) {
    colormap(sim.skinDoses[i] / 1000 / SKIN_SCALE_GY, c);
    colors.array[i * 3] = c[0];
    colors.array[i * 3 + 1] = c[1];
    colors.array[i * 3 + 2] = c[2];
  }
  colors.needsUpdate = true;
}

let lastUi = 0;
let lastField = 0;
let lastMap = 0;
let lastChart = 0;
let planeDirty = true;
let scatterAcc = 0;
let collimating = false;
let collTimer = 0;
document.getElementById('coll').addEventListener('input', () => {
  collimating = true;
  clearTimeout(collTimer);
  collTimer = setTimeout(() => { collimating = false; }, 1200);
});
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  const k = Math.min(1, dt * 9);
  smooth.rao += (state.rao - smooth.rao) * k;
  smooth.cran += (state.cran - smooth.cran) * k;
  smooth.table += (state.table - smooth.table) * k;
  smooth.cath += (state.cath - smooth.cath) * k;

  world.setGantry(smooth.rao, smooth.cran);
  const tableY = currentTableY();
  world.setTableY(tableY);
  world.setCatheter(smooth.cath);

  if (state.mode !== lastMode) {
    lastMode = state.mode;
    applyMode();
  }

  world.getSourceWorld(srcV);
  world.getBeamDirWorld(dirV);
  const ell = ellipsoidsAt(tableY);
  const geom = computeBeamGeometry(srcV, dirV, isoVec, SID, ell, state.coll);
  lastGeom = geom;
  lastParams = doseParams();
  lastEll = ell;

  const running = state.fluoro || state.cine;
  const beamOn = running || collimating;
  world.setBeam(geom.fieldAtDet, beamOn);
  world.setCollimating(collimating);
  world.screen.material.opacity = running ? 0.22 + 0.1 * Math.sin(t * 26) : 0.1;
  world.beamLight.intensity = beamOn ? (collimating ? 9 : 5 + 2 * Math.sin(t * 26)) : 0;

  refreshMaterialsIfDirty();

  if (running) {
    const params = doseParams();
    const lookup = (x, y, z) => field.scatterRateAt(x, y, z);
    sim.accumulate(dt, params, geom, { n: world.nPts, pos: world.skinPos, nor: world.skinNor }, tableY, ell, lookup);
    field.accumulate(dt, params, geom, ell);
    scatterAcc += dt;
    if (scatterAcc >= 0.3) {
      field.accumulateScatter(scatterAcc, params, geom);
      scatterAcc = 0;
    }
    refreshSkinColors();
    planeDirty = true;
  } else {
    sim.rate_mGy_s = 0;
  }

  if (contrast.phase === 'fill') {
    contrast.t += dt / 2.2;
    if (contrast.t >= 1) { contrast.t = 1; contrast.phase = 'hold'; contrast.hold = 0; }
  } else if (contrast.phase === 'hold') {
    contrast.hold += dt;
    if (contrast.hold > 0.5) contrast.phase = 'fade';
  } else if (contrast.phase === 'fade') {
    contrast.t -= dt / 1.6;
    if (contrast.t <= 0) { contrast.phase = 'idle'; contrast.t = 0; }
  }
  if (contrast.phase !== 'idle') {
    const u = contrast.phase === 'fade' ? Math.max(0, contrast.t) : contrast.t;
    const op = contrast.phase === 'fade' ? Math.max(0, contrast.t) * 0.9 : 0.9;
    world.setContrast(u, op);
  } else {
    world.setContrast(0, 0);
  }

  const hs = 1 + 0.035 * Math.sin(t * 7.5);
  world.heart.scale.set(hs, 0.9 * (2 - hs), 0.95);

  world.setPlaneVisible(state.fieldMode !== 'cloud');
  world.setCloudVisible(state.fieldMode !== 'plane');

  if (t - lastField > 0.15) {
    lastField = t;
    const pose = planePose();
    const poseKey = pose.off.toArray().map(v => v.toFixed(3)).join(',') + '|' + pose.quat.toArray().map(v => v.toFixed(4)).join(',');
    if (poseKey !== lastPoseKey) {
      lastPoseKey = poseKey;
      world.setPlane(pose.off, pose.quat);
      planeDirty = true;
    }
    const B = world.planeBasis();
    const isRate = state.fieldQuantity === 'rate';
    const params = doseParams();
    const lookup = (x, y, z) => field.scatterRateAt(x, y, z);
    const sampOpts = isRate
      ? { rate: true, params, geom, ell: lastEll, scatterLookup: lookup }
      : {};
    const s = field.samplePlane(B.center[0], B.center[1], B.center[2], B.u, B.v, world.PLANE_M, PLANE_SIZE / 2, sampOpts);
    const fo = fieldOpts(s.max * (isRate ? 3600 : 1000));
    if (state.fieldMode !== 'cloud') {
      world.drawPlane(s.data, world.PLANE_M, fo);
    }
    if (state.fieldMode !== 'plane') {
      const rateFn = isRate
        ? (x, y, z) => cellDoseRate(params, geom, lastEll, x, y, z) + field.scatterRateAt(x, y, z)
        : null;
      world.updateCloud(field, fo, rateFn);
    }
  }
  if (t - lastMap > 0.2) {
    lastMap = t;
    drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
  }
  if (t - lastUi > 0.1) {
    lastUi = t;
    updateReadouts(sim, geom, field.max);
  }
  if (t - lastChart > 0.25) {
    lastChart = t;
    chart.push(sim.time_s, sim.rate_mGy_s, sim.kaR_mGy, sim.dap_Gycm2);
    chart.draw(sim.time_s);
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

initUI({
  onChange() {
    world.setLayers({ organs: state.showOrgans, bone: state.showBone, brain: state.showBrain });
    world.setTableOffset(state.tableX / 100, state.tableZ / 100);
    if (state.fieldRes !== lastRes) {
      lastRes = state.fieldRes;
      rebuildField();
    }
  },
  onContrast() {
    if (contrast.phase === 'idle' || contrast.phase === 'fade') {
      contrast.phase = 'fill';
      contrast.t = 0;
    }
  },
  onSnapshot() {
    if (!lastGeom) return;
    const isRate = state.fieldQuantity === 'rate';
    const B0 = world.planeBasis();
    const s = field.samplePlane(B0.center[0], B0.center[1], B0.center[2], B0.u, B0.v, 64, PLANE_SIZE / 2, isRate ? { rate: true, params: lastParams, geom: lastGeom, ell: lastEll, scatterLookup: (x, y, z) => field.scatterRateAt(x, y, z) } : {});
    const fo = fieldOpts(s.max * (isRate ? 3600 : 1000));
    const labeledEll = lastEll.map((e, i) => ({ ...e, name: ELL_NAMES[i] || 'Weichteil (Wasser)' }));
    openPlaneSnapshot({
      field,
      center: B0.center,
      u: B0.u,
      v: B0.v,
      n: B0.n,
      half: PLANE_SIZE / 2,
      planeLabel: PLANE_LABELS[state.planePreset] || 'frei',
      planeOffCm: [state.planeOffX, state.planeOffY, state.planeOffZ],
      isRate,
      scaleMin: fo.scaleMin,
      scaleMax: fo.scaleMax,
      unitFactor: fo.unitFactor,
      unit: fo.unit,
      cmap: state.cmap,
      logScale: state.logScale,
      source: lastGeom.source,
      beamDir: lastGeom.beamDir,
      sid: SID,
      iso: isoVec,
      labeledEll,
      params: lastParams,
      geom: lastGeom,

    });
  },
  onReset() {
    sim.reset();
    field.reset();
    chart.reset();
    refreshSkinColors();
    world.updateCloud(field, fieldOpts(1000), null);
    world.drawPlane(new Float32Array(world.PLANE_M * world.PLANE_M), world.PLANE_M, fieldOpts(1000));
    drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let draggingPlane = false;
renderer.domElement.addEventListener('pointerdown', e => {
  if (!world.planeMesh.visible) return;
  pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  if (raycaster.intersectObject(world.planeMesh, false).length) {
    draggingPlane = true;
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
  }
});
window.addEventListener('pointermove', e => {
  if (!draggingPlane) return;
  pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const B = world.planeBasis();
  const n = new THREE.Vector3(...B.n);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, world.planeMesh.position);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const d = hit.sub(ISO).dot(n);
    const off = n.clone().multiplyScalar(THREE.MathUtils.clamp(d, -0.6, 0.6));
    state.planeOffX = Math.round(off.x * 100);
    state.planeOffY = Math.round(off.y * 100);
    state.planeOffZ = Math.round(off.z * 100);
    for (const [id, v] of [['planeOffX', state.planeOffX], ['planeOffY', state.planeOffY], ['planeOffZ', state.planeOffZ]]) {
      document.getElementById(id).value = String(v);
      document.getElementById(id + 'Val').textContent = v + ' cm';
    }
  }
});
window.addEventListener('pointerup', () => {
  if (draggingPlane) {
    draggingPlane = false;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
  }
  if (draggingTable) {
    draggingTable = false;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
  }
});

let draggingTable = false;
renderer.domElement.addEventListener('pointerdown', e => {
  if (draggingPlane) return;
  pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  if (raycaster.intersectObject(world.tableMesh, false).length) {
    draggingTable = true;
    controls.enabled = false;
    renderer.domElement.style.cursor = 'move';
  }
});
window.addEventListener('pointermove', e => {
  if (!draggingTable) return;
  pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -world.tableY);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(tablePlane, hit)) {
    const tx = THREE.MathUtils.clamp(hit.x, -0.3, 0.3);
    const tz = THREE.MathUtils.clamp(hit.z, -0.8, 0.8);
    state.tableX = Math.round(tx * 100);
    state.tableZ = Math.round(tz * 100);
    document.getElementById('tableX').value = String(state.tableX);
    document.getElementById('tableZ').value = String(state.tableZ);
    document.getElementById('tableXVal').textContent = state.tableX + ' cm';
    document.getElementById('tableZVal').textContent = state.tableZ + ' cm';
    world.setTableOffset(tx, tz);
  }
});

world.setLayers({ organs: state.showOrgans, bone: state.showBone, brain: state.showBrain });
world.setTableOffset(0, 0);
{
  const p0 = planePose();
  world.setPlane(p0.off, p0.quat);
  lastPoseKey = p0.off.toArray().map(v => v.toFixed(3)).join(',') + '|' + p0.quat.toArray().map(v => v.toFixed(4)).join(',');
}
refreshSkinColors();
world.drawPlane(new Float32Array(world.PLANE_M * world.PLANE_M), world.PLANE_M, fieldOpts(1000));
world.updateCloud(field, fieldOpts(1000), null);
drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
frame();
