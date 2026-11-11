import { colormapNamed, logMap, PLANE_SIZE } from './dose.js';

const MAT_COLORS = {
  'Tischplatte': '#475569',
  'Schädelknochen': '#b45309',
  'Wirbelsäule': '#b45309',
  'Weichteil (Wasser)': '#0ea5e9',
  'Luft': null
};

function pointIn(p, e) {
  const dx = (p.x - e.c.x) / e.r.x, dy = (p.y - e.c.y) / e.r.y, dz = (p.z - e.c.z) / e.r.z;
  return dx * dx + dy * dy + dz * dz <= 1;
}

function beamSegments(source, beamDir, sid, labeledEll) {
  const steps = 240;
  const segs = [];
  let cur = null;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * sid;
    const p = {
      x: source.x + beamDir.x * t,
      y: source.y + beamDir.y * t,
      z: source.z + beamDir.z * t
    };
    let label = 'Luft';
    for (const e of labeledEll) {
      if (pointIn(p, e)) { label = e.name; break; }
    }
    if (label !== cur) {
      if (cur && MAT_COLORS[cur]) segs.push({ t0: segs._t0 ?? 0, t1: t, label: cur });
      cur = label;
      segs._t0 = t;
    }
  }
  if (cur && MAT_COLORS[cur]) segs.push({ t0: segs._t0 ?? 0, t1: sid, label: cur });
  return segs.filter(s => s.t1 > s.t0);
}

export function openPlaneSnapshot(opts) {
  const {
    field, axis, offset, isRate, scaleUSv, cmap, logScale,
    source, beamDir, sid, iso, labeledEll, planeAxes
  } = opts;

  const W = 1000, H = 1000, BAR = 110;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H + BAR;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H + BAR);

  const m = 250;
  const sampOpts = isRate
    ? { rate: true, params: opts.params, geom: opts.geom, sources: opts.sources, ell: labeledEll }
    : {};
  const s = field.sample(axis, offset, m, sampOpts);
  const img = ctx.createImageData(m, m);
  const c = [0, 0, 0];
  for (let b = 0; b < m; b++) {
    for (let a = 0; a < m; a++) {
      const val = s.data[b * m + a];
      const usv = isRate ? val * 3.6e6 : val * 1000;
      const t = logScale ? logMap(usv, scaleUSv) : Math.max(0, Math.min(1, usv / scaleUSv));
      const o = ((m - 1 - b) * m + a) * 4;
      if (usv <= 0.5) {
        img.data[o] = 250; img.data[o + 1] = 251; img.data[o + 2] = 254;
      } else {
        colormapNamed(cmap, t, c);
        img.data[o] = c[0] * 255; img.data[o + 1] = c[1] * 255; img.data[o + 2] = c[2] * 255;
      }
      img.data[o + 3] = 255;
    }
  }
  const off = document.createElement('canvas');
  off.width = m; off.height = m;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, W, H);

  const A = planeAxes[axis];
  const center = { x: iso.x + A.n[0] * offset, y: iso.y + A.n[1] * offset, z: iso.z + A.n[2] * offset };
  const toPx = p => {
    const a = (p.x - center.x) * A.u[0] + (p.y - center.y) * A.u[1] + (p.z - center.z) * A.u[2];
    const b = (p.x - center.x) * A.v[0] + (p.y - center.y) * A.v[1] + (p.z - center.z) * A.v[2];
    return [((a + PLANE_SIZE / 2) / PLANE_SIZE) * W, (1 - (b + PLANE_SIZE / 2) / PLANE_SIZE) * H];
  };

  const segs = beamSegments(source, beamDir, sid, labeledEll);
  ctx.lineCap = 'round';
  for (const sgm of segs) {
    const p0 = { x: source.x + beamDir.x * sgm.t0, y: source.y + beamDir.y * sgm.t0, z: source.z + beamDir.z * sgm.t0 };
    const p1 = { x: source.x + beamDir.x * sgm.t1, y: source.y + beamDir.y * sgm.t1, z: source.z + beamDir.z * sgm.t1 };
    const [x0, y0] = toPx(p0);
    const [x1, y1] = toPx(p1);
    if (x0 < 0 && x1 < 0 || x0 > W && x1 > W || y0 < 0 && y1 < 0 || y0 > H && y1 > H) continue;
    ctx.strokeStyle = MAT_COLORS[sgm.label] || '#111827';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

  const axisName = { x: 'Frontal (x)', y: 'Axial (y)', z: 'Sagittal (z)' }[axis];
  const unit = isRate ? 'µSv/h' : 'µSv';
  const modeName = isRate ? 'Dosisleistung' : 'akkumulierte Dosis';
  ctx.fillStyle = '#0f172a';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.fillText(`Schnittebene ${axisName} · Offset ${(offset * 100).toFixed(0)} cm · ${modeName}${logScale ? ' (log)' : ''}`, 24, H + 38);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Durchstoßungslinie gefärbt nach Material:  ■ Tisch  ■ Schädelknochen  ■ Weichteil (Wasser)`, 24, H + 66);

  const barX = 24, barY = H + 80, barW = W - 48, barH = 20;
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  for (let i = 0; i <= 10; i++) {
    const col = [0, 0, 0];
    colormapNamed(cmap, i / 10, col);
    grad.addColorStop(i / 10, `rgb(${(col[0] * 255) | 0},${(col[1] * 255) | 0},${(col[2] * 255) | 0})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 20px system-ui, sans-serif';
  const fmt = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 10 ? 1 : 0);
  ctx.fillText('0', barX, barY + barH + 24);
  ctx.fillText(`${fmt(scaleUSv)} ${unit}`, barX + barW, barY + barH + 24);
  ctx.textAlign = 'center';
  ctx.fillText(`Farbskala: ${modeName} in ${unit}${logScale ? ' · log10' : ''} · Skala 0–${fmt(scaleUSv)} ${unit}`, barX + barW / 2, barY - 8);
  ctx.textAlign = 'left';

  cv.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, 'image/png');
}
