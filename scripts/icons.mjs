import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The Moments mark, and every icon file made from it.
 *
 * The mark is the butterfly kite from the beach photograph - the one where
 * the kite is up and the running is happy. Every colour below was sampled
 * from that photograph rather than chosen: the rose and gold are the kite's
 * wings, the pale blue is the sky behind it, and the deep blue-green is the
 * sea. The kite itself is drawn, not traced from the picture, so nothing
 * identifying ever leaves the private repo.
 *
 * Run: npm run icons
 */

const OUT = new URL('../public/', import.meta.url);

export const C = {
  rose: '#d72b58',   // kite upper wings
  gold: '#f5bd18',   // kite lower wings
  sky: '#cce6e7',    // sky behind the kite
  dusk: '#35617a',   // sea, lit
  duskDeep: '#1e3f57', // sea, shaded
  ink: '#2b1a20',    // the kite's dark edges, for light backgrounds
};

/**
 * The butterfly alone, in a 512 box. `bare` leaves out the background so the
 * same shape can sit on a light surface inside the app.
 */
export function mark({ upper = C.rose, lower = C.gold, body = C.sky } = {}) {
  const wing = `
    <path d="M256 220 C 296 138 378 84 446 92 C 482 96 486 144 454 192
             C 416 250 328 282 266 272 Z" fill="${upper}"/>
    <path d="M256 266 C 310 262 382 292 404 342 C 422 382 386 414 342 404
             C 296 394 260 344 256 296 Z" fill="${lower}"/>`;
  return `
  <g transform="translate(0 6) rotate(-9 256 256)">
    <g>${wing}</g>
    <g transform="translate(512 0) scale(-1 1)">${wing}</g>
    <path d="M256 168 C 268 176 272 196 272 232 C 272 292 266 330 256 350
             C 246 330 240 292 240 232 C 240 196 244 176 256 168 Z" fill="${body}"/>
    <path d="M250 176 C 236 150 218 138 198 134" fill="none" stroke="${body}"
          stroke-width="9" stroke-linecap="round"/>
    <path d="M262 176 C 276 150 294 138 314 134" fill="none" stroke="${body}"
          stroke-width="9" stroke-linecap="round"/>
  </g>`;
}

/**
 * A full icon. `inset` leaves the safe zone a maskable icon needs; `rx`
 * rounds the corners for the favicon, where nothing else will round them.
 */
export function icon({ size = 512, inset = 0.12, rx = 0, id = 'sea' }) {
  const m = size * inset;
  const w = size - m * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Moments">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${C.dusk}"/>
      <stop offset="1" stop-color="${C.duskDeep}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#${id})"/>
  <g transform="translate(${m} ${m}) scale(${w / 512})">${mark()}</g>
</svg>`;
}

// Everything below runs only when this file is the command being run, so the
// mark above can also be imported by other tooling without writing anything.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // iOS ignores an SVG apple-touch-icon and ignores transparency, so every
  // home-screen icon is written as an opaque PNG, corner to corner.
  const PNGS = [
    { file: 'apple-touch-icon.png', size: 180, inset: 0.12 },
    { file: 'icon-192.png', size: 192, inset: 0.12 },
    { file: 'icon-512.png', size: 512, inset: 0.12 },
    { file: 'icon-maskable-512.png', size: 512, inset: 0.20 },
  ];

  const SVGS = [
    // The favicon is read at 16-32px in a tab, so it is drawn tighter than
    // the home-screen icons, which need their margin for the mask.
    { file: 'icon.svg', inset: 0.06, rx: 116 },
    { file: 'icon-maskable.svg', inset: 0.20, rx: 0 },
  ];

  for (const { file, inset, rx } of SVGS) {
    writeFileSync(new URL(file, OUT), icon({ size: 512, inset, rx }));
    console.log(`${file.padEnd(24)} 512x512`);
  }

  // The PNGs need a rasteriser. Playwright is not a dependency of this app -
  // it would pull a browser down for everyone just to redraw four files - so
  // the SVGs above are always written and the PNGs are refreshed only when a
  // copy of Playwright happens to be available. The committed PNGs stay valid
  // until the mark itself changes.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('\nPNGs skipped: Playwright is not installed here.');
    console.log('The committed PNGs still match this mark. To redraw them:');
    console.log('  npm i -D playwright && npx playwright install chromium && npm run icons');
    process.exit(0);
  }

  const browser = await chromium.launch();
  for (const { file, size, inset } of PNGS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;overflow:hidden}</style>${icon({ size, inset })}`,
      { waitUntil: 'load' }
    );
    const buf = await page.screenshot({ omitBackground: false });
    writeFileSync(new URL(file, OUT), buf);
    console.log(`${file.padEnd(24)} ${size}x${size}  ${(buf.length / 1024).toFixed(0)}KB`);
    await page.close();
  }
  await browser.close();

}
