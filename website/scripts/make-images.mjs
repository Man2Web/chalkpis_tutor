// Makes the images that sit beside the site's pages in public/:
//   og.png                1200×630 link preview (WhatsApp, Facebook, Meta ads, X), photographed from scripts/og.html
//   apple-touch-icon.png  180×180 home-screen icon: the blue C on white, like the app icon
//   favicon-32.png        32×32 for browsers and crawlers that skip favicon.svg
//   favicon.ico           the 32 px and 48 px PNGs in one .ico
// Run from website/: `npm run images` (needs Chrome or Edge for og.png; set CHROME to its path if it is elsewhere).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const pub = join(root, 'public');
const mark = readFileSync(join(pub, 'favicon.svg'), 'utf8');

/** The C mark centred on a white square, the mark taking `share` of the side. */
async function icon(size, share) {
  const inner = Math.round(size * share);
  const c = await sharp(Buffer.from(mark), { density: 600 }).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: c, gravity: 'centre' }])
    .png()
    .toBuffer();
}

// The hero picture: the real app's Home screen, cropped (not redrawn) from the App Store screenshot, at 2x for a
// 480 px wide slot. The phone rises from the bottom edge of the store's blue background.
mkdirSync(join(pub, 'app'), { recursive: true });
await sharp(resolve(root, '..', 'marketing', 'store', 'appstore', '6.9', 'phone-02.png'))
  .extract({ left: 0, top: 420, width: 1320, height: 1760 })
  .resize(960)
  .webp({ quality: 88 })
  .toFile(join(pub, 'app', 'home-dashboard.webp'));

writeFileSync(join(pub, 'apple-touch-icon.png'), await icon(180, 0.62));
const png32 = await icon(32, 0.84);
const png48 = await icon(48, 0.84);
writeFileSync(join(pub, 'favicon-32.png'), png32);

// An .ico is a small header plus a directory of images; PNG images can be stored as they are.
const images = [[32, png32], [48, png48]];
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach(([size, data], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(size, e);
  head.writeUInt8(size, e + 1);
  head.writeUInt16LE(1, e + 4); // colour planes
  head.writeUInt16LE(32, e + 6); // bits per pixel
  head.writeUInt32LE(data.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
writeFileSync(join(pub, 'favicon.ico'), Buffer.concat([head, ...images.map(([, d]) => d)]));

const browsers = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);
const browser = browsers.find((b) => existsSync(b));
if (!browser) {
  console.log('Icons done. No Chrome or Edge found, so og.png was not remade (set CHROME to its path).');
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'og-'));
  /** Photographs scripts/og.html (with an optional query) at width×height into `out`. */
  const shoot = async (query, width, height, out) => {
    const shot = join(tmp, `${width}x${height}.png`);
    const url = pathToFileURL(join(root, 'scripts', 'og.html')).href + query;
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${width},${height}`, `--screenshot=${shot}`, '--virtual-time-budget=3000', url,
    ], { stdio: 'ignore' });
    // the window can come out a few pixels off; make it exact
    await sharp(shot).resize(width, height, { fit: 'cover', position: 'left top' }).png({ compressionLevel: 9 }).toFile(out);
  };
  await shoot('', 1200, 630, join(pub, 'og.png'));
  // the Facebook Page cover lives with the marketing files, not on the site
  const social = resolve(root, '..', 'marketing', 'social');
  mkdirSync(social, { recursive: true });
  await shoot('?cover', 1640, 624, join(social, 'facebook-cover-1640x624.png'));
  console.log('Made og.png, the icons and marketing/social/facebook-cover-1640x624.png.');
}
