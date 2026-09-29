import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

import { repoRoot } from './lib/paths.ts';

// same drawing as public/favicon.svg, rasterised here because manifest icons must be PNG and
// a raster dependency for three files isn't worth it

type Rgb = [number, number, number];
const BLUE: Rgb = [0x1d, 0x4e, 0xd8];
const WHITE: Rgb = [0xff, 0xff, 0xff];
const AMBER: Rgb = [0xf5, 0x9e, 0x0b];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crcTable[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(size: number, pixel: (x: number, y: number) => Rgb): Uint8Array {
  const stride = size * 3 + 1;
  const raw = new Uint8Array(size * stride);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) raw.set(pixel(x, y), y * stride + 1 + x * 3);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

function inRoundedRect(
  x: number,
  y: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
): boolean {
  if (x < x0 || x >= x0 + w || y < y0 || y >= y0 + h) return false;
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r));
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// `inset` shrinks the artwork for maskable icons, whose safe zone is the inner 80%
function icon(size: number, inset: number): Uint8Array {
  const u = (size - 2 * inset) / 64;
  const s = (n: number): number => inset + n * u;
  return encodePng(size, (px, py) => {
    const x = px + 0.5;
    const y = py + 0.5;
    if ((x - s(42)) ** 2 + (y - s(41)) ** 2 <= (5 * u) ** 2) return AMBER;
    if (inRoundedRect(x, y, s(20), s(24), 24 * u, 4 * u, 2 * u)) return BLUE;
    if (inRoundedRect(x, y, s(20), s(32), 16 * u, 4 * u, 2 * u)) return BLUE;
    if (inRoundedRect(x, y, s(14), s(16), 36 * u, 32 * u, 3 * u)) return WHITE;
    return BLUE;
  });
}

const out = `${repoRoot}apps/web/public/`;
writeFileSync(`${out}pwa-192.png`, icon(192, 0));
writeFileSync(`${out}pwa-512.png`, icon(512, 0));
writeFileSync(`${out}pwa-maskable-512.png`, icon(512, 51));
console.log(`wrote 3 icons to ${out}`);
