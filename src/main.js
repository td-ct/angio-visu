import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld, ISO, SID, TABLE_BASE } from './world.js';
import { DoseSim, computeBeamGeometry, colormap, SKIN_SCALE_GY } from './dose.js';
import { state, initUI, doseParams, updateReadouts, Chart, drawSkinMap } from './ui.js';

const container = document.getElementById('scene');
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
sim.attachSlice(world.slice.n);

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

function updateSliceTexture() {
  const { ctx, canvas, n } = world.slice;
  const img = ctx.createImageData(n, n);
  const c = [0, 0, 0];
  for (let i = 0; i < n * n; i++) {
    colormap(sim.sliceDoses[i] / 1000 / SKIN_SCALE_GY, c);
    const o = i * 4;
    img.data[o] = c[0] * 255;
    img.data[o + 1] = c[1] * 255;
    img.data[o + 2] = c[2] * 255;
    img.data[o + 3] = 235;
  }
  ctx.putImageData(img, 0, 0);
  world.slice.tex.needsUpdate = true;
}

let lastUi = 0;
let lastSlice = 0;
let lastMap = 0;
let lastChart = 0;
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

  world.getSourceWorld(srcV);
  world.getBeamDirWorld(dirV);
  const ell = ellipsoidsAt(tableY);
  const geom = computeBeamGeometry(srcV, dirV, ISO, SID, ell, state.coll);

  const running = state.fluoro || state.cine;
  world.setBeam(geom.fieldAtDet, running);
  world.screen.material.opacity = running ? 0.22 + 0.1 * Math.sin(t * 26) : 0.1;
  world.beamLight.intensity = running ? 5 + 2 * Math.sin(t * 26) : 0;

  if (running) {
    sim.setSliceMatrix(world.gantry.matrixWorld);
    sim.accumulate(dt, doseParams(), geom, { n: world.nPts, pos: world.skinPos, nor: world.skinNor }, tableY, ell);
    refreshSkinColors();
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

  if (t - lastSlice > 0.15) {
    lastSlice = t;
    if (running || sim.sliceDoses.some(v => v > 0)) updateSliceTexture();
  }
  if (t - lastMap > 0.2) {
    lastMap = t;
    drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
  }
  if (t - lastUi > 0.1) {
    lastUi = t;
    updateReadouts(sim, geom);
  }
  if (t - lastChart > 0.25) {
    lastChart = t;
    chart.push(sim.time_s, sim.rate_mGy_s, sim.kaR_mGy);
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
    chart.reset();
    refreshSkinColors();
    updateSliceTexture();
    drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

refreshSkinColors();
drawSkinMap(skinCanvas, world.skinPos, world.skinNor, sim.skinDoses, world.nPts);
frame();
