/**
 * Rasterises public/icon.svg into the PNG sizes the manifest names, plus
 * favicon.ico.
 *
 * Chrome does the rendering. There is no rsvg-convert, ImageMagick, Inkscape
 * or sharp on this machine, and adding a native image dependency to a project
 * whose only need for one is eight PNGs generated once was not worth it. Every
 * Mac that can run this app already has a renderer installed.
 *
 *   node tools/build-icons.mjs
 *
 * Only needs re-running when public/icon.svg changes.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** The manifest's sizes. Keep the two in step. */
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
/** What goes inside favicon.ico. 16 and 32 for tabs, 48 for the Windows list. */
const ICO_SIZES = [16, 32, 48];

const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8');
const work = mkdtempSync(join(tmpdir(), 'daybook-icons-'));

/** Renders the mark at one size and returns the PNG bytes. */
function render(size) {
  const html = join(work, `${size}.html`);
  const png = join(work, `${size}.png`);

  // The SVG is inlined rather than linked: a file:// <img> is subject to
  // Chrome's local-file rules and intermittently renders as nothing.
  writeFileSync(
    html,
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );

  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${size},${size}`,
      `--screenshot=${png}`,
      `file://${html}`,
    ],
    { stdio: 'ignore' },
  );

  return readFileSync(png);
}

/**
 * An .ico is a 6-byte header, one 16-byte directory entry per image, then the
 * image data. The data is allowed to be a whole PNG file rather than a DIB,
 * which every browser still in use understands and which saves writing a BMP
 * encoder for something rendered once.
 */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const directory = [];

  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16);
    // 256 is written as 0 in a single byte; nothing here is that big, but the
    // rule is worth honouring in case ICO_SIZES grows.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    directory.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...directory, ...entries.map((e) => e.data)]);
}

for (const size of SIZES) {
  const png = render(size);
  writeFileSync(join(root, `public/icons/icon-${size}x${size}.png`), png);
  console.log(`icon-${size}x${size}.png  ${png.length} bytes`);
}

writeFileSync(
  join(root, 'public/favicon.ico'),
  ico(ICO_SIZES.map((size) => ({ size, data: render(size) }))),
);
console.log('favicon.ico');

// iOS never applies a mask and never rounds a transparent corner itself, so
// the apple-touch-icon is the same full-bleed square, just under the name iOS
// looks for.
copyFileSync(
  join(root, 'public/icons/icon-192x192.png'),
  join(root, 'public/icons/apple-touch-icon.png'),
);
console.log('apple-touch-icon.png');

rmSync(work, { recursive: true, force: true });
