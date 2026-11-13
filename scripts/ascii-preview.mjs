import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'preview.png');
const COLS = Number(process.env.COLS || 118);
const png = readFileSync(src);

let pos = 8;
let W = 0, H = 0;
const idat = [];
while (pos < png.length) {
  const len = png.readUInt32BE(pos);
  const type = png.toString('ascii', pos + 4, pos + 8);
  const data = png.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    W = data.readUInt32BE(0);
    H = data.readUInt32BE(4);
  } else if (type === 'IDAT') {
    idat.push(data);
  }
  pos += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = 1 + W * 4;
const px = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = y * stride + 1 + x * 4;
    const d = (y * W + x) * 4;
    px[d] = raw[o]; px[d + 1] = raw[o + 1]; px[d + 2] = raw[o + 2]; px[d + 3] = 255;
  }
}

const ROWS = Math.round((H / W) * COLS * 0.5);
const chars = ' .:-=+*#%@';
const out = [];
for (let ry = 0; ry < ROWS; ry++) {
  let line = '';
  for (let rx = 0; rx < COLS; rx++) {
    const x0 = Math.floor(rx / COLS * W);
    const x1 = Math.max(x0 + 1, Math.floor((rx + 1) / COLS * W));
    const y0 = Math.floor(ry / ROWS * H);
    const y1 = Math.max(y0 + 1, Math.floor((ry + 1) / ROWS * H));
    let best = -1, br = 0, bg = 0, bb = 0, bl = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (l > bl) { bl = l; br = px[i]; bg = px[i + 1]; bb = px[i + 2]; best = l; }
      }
    }
    let ch;
    if (best < 22) ch = ' ';
    else if (br > 90 && br > bg * 1.6 && br > bb * 1.6) ch = 'R';
    else if (br > 110 && bg > 95 && bb < 120 && br > bb * 1.2) ch = 'Y';
    else if (bb > 140 && bb > br * 1.6 && bb > bg * 1.2) ch = 'b';
    else if (bg > 110 && bg > br * 1.3 && bg > bb * 1.15) ch = 'g';
    else ch = chars[Math.min(chars.length - 1, Math.max(1, Math.floor(bl / 256 * chars.length)))];
    line += ch;
  }
  out.push(line);
}
console.log(out.join('\n'));
console.error(`Legende: R=rot (Gefäße/rote Dosis)  Y=gelb (Kontrast/Strahl)  b=blau (Dosis niedrig)  g/grün=Dosis mittel  #/@ hell (Körper/Stahl)  . Hintergrund`);
