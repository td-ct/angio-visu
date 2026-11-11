import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld, ISO, SID, TABLE_BASE } from './world.js';
import { DoseSim, DoseField, computeBeamGeometry, colormap, SKIN_SCALE_GY, scatterSources, scatterRateAt, cellDoseRate } from './dose.js';
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
const field = new DoseField(isoVec);
world.setIso(isoVec);
world.setPlane(state.planeAxis, state.planeOff / 100);
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
let lastGeom = null, lastParams = null, lastEll = null, lastSources = [];
const ELL_NAMES = ['Weichteil (Wasser)', 'Weichteil (Wasser)', 'Schädelknochen', 'Tischplatte'];

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
  lastSources = scatterSources(geom, ell, lastParams);

  const running = state.fluoro || state.cine;
  const beamOn = running || collimating;
  world.setBeam(geom.fieldAtDet, beamOn);
  world.setCollimating(collimating);
  world.screen.material.opacity = running ? 0.22 + 0.1 * Math.sin(t * 26) : 0.1;
  world.beamLight.intensity = beamOn ? (collimating ? 9 : 5 + 2 * Math.sin(t * 26)) : 0;

  if (running) {
    const params = doseParams();
    sim.accumulate(dt, params, geom, { n: world.nPts, pos: world.skinPos, nor: world.skinNor }, tableY, ell);
    field.accumulate(dt, params, geom, ell);
    scatterAcc += dt;
    if (scatterAcc >= 0.12) {
      field.accumulateScatter(scatterAcc, params, geom, ell);
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
    if (state.planeAxis !== world.planeAxis || state.planeOff / 100 !== world.planeOffset) {
      world.setPlane(state.planeAxis, state.planeOff / 100);
      planeDirty = true;
    }
    const isRate = state.fieldQuantity === 'rate';
    const params = doseParams();
    const sources = scatterSources(geom, ell, params);
    const sampOpts = isRate
      ? { rate: true, params, geom, ell: lastEll, sources }
      : {};
    const s = field.sample(state.planeAxis, state.planeOff / 100, world.PLANE_M, sampOpts);
    const fo = fieldOpts(s.max * (isRate ? 3600 : 1000));
    if (state.fieldMode !== 'cloud') {
      world.drawPlane(s.data, world.PLANE_M, fo);
    }
    if (state.fieldMode !== 'plane') {
      const rateFn = isRate
        ? (x, y, z) => cellDoseRate(params, geom, lastEll, x, y, z) + scatterRateAt({ x, y, z }, sources, params.kVp, lastEll)
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
    const s = field.sample(state.planeAxis, state.planeOff / 100, 64, isRate ? { rate: true, params: lastParams, geom: lastGeom, sources: lastSources, ell: lastEll } : {});
    const fo = fieldOpts(s.max * (isRate ? 3600 : 1000));
    const labeledEll = lastEll.map((e, i) => ({ ...e, name: ELL_NAMES[i] || 'Weichteil (Wasser)' }));
    openPlaneSnapshot({
      field,
      axis: state.planeAxis,
      offset: state.planeOff / 100,
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
      planeAxes: world.planeAxes,
      params: lastParams,
      geom: lastGeom,
      sources: lastSources
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
  const A = world.planeAxes[world.planeAxis];
  const n = new THREE.Vector3(...A.n);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, world.planeMesh.position);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const off = THREE.MathUtils.clamp(hit.sub(ISO).dot(n), -0.6, 0.6);
    state.planeOff = Math.round(off * 100);
    const sl = document.getElementById('planeOff');
    sl.value = String(state.planeOff);
    document.getElementById('planeOffVal').textContent = state.planeOff + ' cm';
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
refreshSkinColors();
world.drawPlane(new Float32Array(world.PLANE_M * world.PLANE_M), world.PLANE_M, fieldOpts(1000));
world.updateCloud(field, fieldOpts(1000), null);
drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
frame();
