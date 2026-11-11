import { colormap, SKIN_SCALE_GY, scatterFraction, backscatterFactor } from './dose.js';

export const state = {
  fluoro: false,
  cine: false,
  doseLevel: 1,
  kvp: 81,
  pw: 4,
  fps: 15,
  rao: 0,
  cran: 0,
  coll: 0.7,
  table: 0,
  cath: 0,
  fieldMode: 'both',
  planeAxis: 'z',
  planeOff: 0,
  fieldRate: false
};

const $ = id => document.getElementById(id);

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m > 0 ? `${m}:${sec.toFixed(1).padStart(4, '0')} min` : `${sec.toFixed(1)} s`;
}

function fmtGy(v) {
  if (v >= 1) return `${v.toFixed(2)} Gy`;
  return `${(v * 1000).toFixed(0)} mGy`;
}

export function initUI(actions) {
  const bind = (id, key, parse = Number, suffix = '') => {
    const el = $(id);
    const val = $(id + 'Val');
    const apply = () => {
      state[key] = parse(el.value);
      if (val) val.textContent = el.value + suffix;
      actions.onChange();
    };
    el.addEventListener('input', apply);
    apply();
  };
  bind('kvp', 'kvp', Number, ' kVp');
  bind('pw', 'pw', Number, ' ms');
  bind('rao', 'rao', Number, '°');
  bind('cran', 'cran', Number, '°');
  bind('coll', 'coll', v => Number(v) / 100, '%');
  bind('table', 'table', Number, ' cm');
  bind('cath', 'cath', v => Number(v) / 100, '%');
  bind('planeOff', 'planeOff', Number, ' cm');

  $('fieldMode').addEventListener('change', e => {
    state.fieldMode = e.target.value;
    actions.onChange();
  });
  $('planeAxis').addEventListener('change', e => {
    state.planeAxis = e.target.value;
    actions.onChange();
  });
  $('fieldRate').addEventListener('change', e => {
    state.fieldRate = e.target.checked;
    actions.onChange();
  });
  $('btnFrontal').addEventListener('click', () => {
    state.planeAxis = 'x';
    state.planeOff = 0;
    $('planeAxis').value = 'x';
    $('planeOff').value = '0';
    $('planeOffVal').textContent = '0 cm';
    actions.onChange();
  });
  $('btnSag').addEventListener('click', () => {
    state.planeAxis = 'z';
    state.planeOff = 0;
    $('planeAxis').value = 'z';
    $('planeOff').value = '0';
    $('planeOffVal').textContent = '0 cm';
    actions.onChange();
  });
  $('btnAxial').addEventListener('click', () => {
    state.planeAxis = 'y';
    state.planeOff = 0;
    $('planeAxis').value = 'y';
    $('planeOff').value = '0';
    $('planeOffVal').textContent = '0 cm';
    actions.onChange();
  });

  document.querySelectorAll('#kvPresets button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.kvp = Number(btn.dataset.kv);
      $('kvp').value = String(state.kvp);
      $('kvpVal').textContent = state.kvp + ' kVp';
      actions.onChange();
    });
  });

  $('fps').addEventListener('change', e => {
    state.fps = Number(e.target.value);
    actions.onChange();
  });
  $('doseLevel').addEventListener('change', e => {
    state.doseLevel = Number(e.target.value);
    actions.onChange();
  });

  $('btnFluoro').addEventListener('click', () => {
    state.fluoro = !state.fluoro;
    $('btnFluoro').textContent = state.fluoro ? 'Fluoro stoppen' : 'Fluoro starten';
    $('btnFluoro').classList.toggle('active', state.fluoro);
    actions.onChange();
  });
  $('btnCine').addEventListener('click', () => {
    state.cine = !state.cine;
    $('btnCine').classList.toggle('active', state.cine);
    $('cinebadge').style.display = state.cine ? 'block' : 'none';
    actions.onChange();
  });
  $('btnContrast').addEventListener('click', () => actions.onContrast());
  $('btnReset').addEventListener('click', () => actions.onReset());
}

export function doseParams() {
  const mA = [8, 20, 50][state.doseLevel];
  return {
    kVp: state.kvp,
    mA,
    pwMs: state.pw,
    fps: state.fps,
    cine: state.cine,
    fieldFrac: state.coll
  };
}

export function updateReadouts(sim, geom, fieldMaxMGy = 0) {
  $('rTime').textContent = fmtTime(sim.time_s);
  $('rPulses').textContent = Math.round(sim.pulses).toLocaleString('de-DE');
  $('rKar').textContent = fmtGy(sim.kaR_mGy / 1000);
  $('rDap').textContent = sim.dap_Gycm2.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Gy·cm²';
  $('rDap2').textContent = sim.dap_Gycm2.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Gy·cm²';
  const skinEl = $('skinmax');
  const peakGy = sim.peak_mGy / 1000;
  skinEl.textContent = fmtGy(peakGy);
  skinEl.className = 'v' + (peakGy >= 5 ? ' danger' : peakGy >= 2 ? ' warn' : '');
  $('rRate').textContent = sim.rate_mGy_s.toFixed(1) + ' mGy/s';
  $('rFieldMax').textContent = fmtGy(fieldMaxMGy / 1000);
  if (geom) {
    const p = doseParams();
    $('rSpr').textContent = (scatterFraction(p.kVp, geom.fieldAtDet) * 100).toFixed(1) + ' %';
    $('rBsf').textContent = backscatterFactor(p.kVp, geom.fieldAtDet).toFixed(2);
  }
  $('rSsd').textContent = geom ? (geom.ssd * 100).toFixed(0) + ' cm' : '—';
  $('rField').textContent = geom ? (geom.fieldAtDet * 100).toFixed(0) + ' cm' : '—';
  const p = doseParams();
  $('rMas').textContent = (p.mA * p.pwMs / 1000 * (p.cine ? 4 : 1)).toFixed(2) + ' mAs';
}

export class Chart {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = [];
  }
  reset() {
    this.data.length = 0;
  }
  push(t, rate, kar, dap = 0) {
    this.data.push([t, rate, kar, dap]);
    if (this.data.length > 600) this.data.shift();
  }
  draw(now) {
    const { ctx, cv } = this;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const win = 60;
    const t1 = now - win;
    const pts = this.data.filter(d => d[0] >= t1);
    if (pts.length < 2) return;
    let maxRate = 1;
    let maxKar = 1;
    let maxDap = 1;
    for (const d of pts) {
      if (d[1] > maxRate) maxRate = d[1];
      if (d[2] > maxKar) maxKar = d[2];
      if (d[3] > maxDap) maxDap = d[3];
    }
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    const x = t => ((t - t1) / win) * W;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach((d, i) => {
      const px = x(d[0]);
      const py = H - (d[1] / maxRate) * (H - 6) - 3;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    pts.forEach((d, i) => {
      const px = x(d[0]);
      const py = H - (d[2] / maxKar) * (H - 6) - 3;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    pts.forEach((d, i) => {
      const px = x(d[0]);
      const py = H - (d[3] / maxDap) * (H - 6) - 3;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.fillText('max ' + maxRate.toFixed(1) + ' mGy/s', 4, 10);
    ctx.fillText('Ka,r ' + maxKar.toFixed(0) + ' mGy', 4, H - 4);
  }
}

export function drawSkinMap(canvas, skinPos, skinNor, doses, n) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const x0 = -0.38, x1 = 0.38, z0 = -0.95, z1 = 0.98;
  const px = x => ((x - x0) / (x1 - x0)) * W;
  const pz = z => ((z - z0) / (z1 - z0)) * H;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(px(0), pz(-0.02), (0.2 / (x1 - x0)) * W, (0.58 / (z1 - z0)) * H, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(px(0.02), pz(-0.72), (0.115 / (x1 - x0)) * W, (0.14 / (z1 - z0)) * H, 0, 0, Math.PI * 2);
  ctx.stroke();
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const d = doses[i] / 1000 / SKIN_SCALE_GY;
    colormap(d, c);
    const facing = skinNor[i * 3 + 1];
    ctx.fillStyle = `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
    ctx.globalAlpha = 0.25 + 0.75 * Math.min(1, d * 6);
    ctx.fillRect(px(skinPos[i * 3]) - 1.6, pz(skinPos[i * 3 + 2]) - 1.6, 3.2, 3.2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px sans-serif';
  ctx.fillText('kranial', 4, 10);
  ctx.fillText('kaudal', 4, H - 4);
}
