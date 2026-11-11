import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

await page.click('#btnFluoro');
await page.locator('#cath').fill('85');
await page.locator('#rao').fill('25');
await page.locator('#cran').fill('-10');
await page.click('#btnContrast');
await page.waitForTimeout(6000);

const read = id => page.locator('#' + id).textContent();
console.log('time:', await read('rTime'));
console.log('pulses:', await read('rPulses'));
console.log('Ka,r:', await read('rKar'));
console.log('DAP:', await read('rDap'));
console.log('skinmax:', await read('skinmax'));
console.log('rate:', await read('rRate'));
console.log('SSD:', await read('rSsd'));
console.log('field:', await read('rField'));
console.log('mAs:', await read('rMas'));

await page.screenshot({ path: 'scripts/smoke.png' });
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
