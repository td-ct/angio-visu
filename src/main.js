import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld, ISO, SID, TABLE_BASE } from './world.js';
import { DoseSim, DoseField, computeBeamGeometry, colormap, SKIN_SCALE_GY, RATE_SCALE_USVH, DOSE_FLOOR_USV, scatterSources, scatterRateAt, cellDoseRate } from './dose.js';
import { state, initUI, doseParams, updateReadouts, Chart, drawSkinMap } from './ui.js';

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
  world.updateCloud(field, DOSE_FLOOR_USV, false, state.cmap, state.logScale, null);
  world.drawPlane(new Float32Array(world.PLANE_M * world.PLANE_M), world.PLANE_M, DOSE_FLOOR_USV, false, state.cmap, state.logScale);
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
  for (let i = 0; i < ellipsoidsWorld.length; i++) {
    ellipsoidsWorld[i].c.y = world.ellipsoidsLocal[i].c.y + tableY;
  }
  return ellipsoidsWorld;
}

function currentTableY() {
  return TABLE_BASE + smooth.table / 100;
}

const srcV = new THREE.Vector3();
const dirV = new THREE.Vector3();

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

  const running = state.fluoro || state.cine;
  world.setBeam(geom.fieldAtDet, running);
  world.screen.material.opacity = running ? 0.22 + 0.1 * Math.sin(t * 26) : 0.1;
  world.beamLight.intensity = running ? 5 + 2 * Math.sin(t * 26) : 0;

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
    const isRate = state.fieldRate;
    const scaleUSv = isRate ? RATE_SCALE_USVH : Math.max(field.max * 1000, DOSE_FLOOR_USV);
    if (state.fieldMode !== 'cloud') {
      const params = doseParams();
      const sources = scatterSources(geom, ell, params);
      const opts = isRate
        ? { rate: true, params, geom, ell, sources }
        : {};
      const s = field.sample(state.planeAxis, state.planeOff / 100, world.PLANE_M, opts);
      world.drawPlane(s.data, world.PLANE_M, scaleUSv, isRate, state.cmap, state.logScale);
    }
    if (state.fieldMode !== 'plane') {
      const params = doseParams();
      const sources = scatterSources(geom, ell, params);
      const rateFn = isRate
        ? (x, y, z) => cellDoseRate(params, geom, ell, x, y, z) + scatterRateAt({ x, y, z }, sources, params.kVp, ell)
        : null;
      world.updateCloud(field, scaleUSv, isRate, state.cmap, state.logScale, rateFn);
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
  onChange() {},
  onContrast() {
    if (contrast.phase === 'idle' || contrast.phase === 'fade') {
      contrast.phase = 'fill';
      contrast.t = 0;
    }
  },
  onReset() {
    sim.reset();
    field.reset();
    chart.reset();
    refreshSkinColors();
    world.updateCloud(field, DOSE_FLOOR_USV, false, state.cmap, state.logScale, null);
    world.drawPlane(new Float32Array(world.PLANE_M * world.PLANE_M), world.PLANE_M, DOSE_FLOOR_USV, false, state.cmap, state.logScale);
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
});

refreshSkinColors();
world.drawPlane(new Float32Array(world.PLANE_M * world.PLANE_M), world.PLANE_M, DOSE_FLOOR_USV, false, state.cmap, state.logScale);
world.updateCloud(field, DOSE_FLOOR_USV, false, state.cmap, state.logScale, null);
drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
frame();
