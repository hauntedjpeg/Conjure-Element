/**
 * Draw the toolbar icons. Dependency-free so the icons can be regenerated
 * anywhere: a rounded violet square with a lighter inset square, echoing the
 * box-model bands the picker draws.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = fileURLToPath(new URL("../packages/extension/public/icon/", import.meta.url));
const SIZES = [16, 32, 48, 96, 128, 256, 512];
const SAMPLES = 4;

const OUTER = [109, 40, 217];
const INNER = [221, 214, 254];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Is (x, y) inside a rounded rectangle? Coordinates in 0..1. */
function inRoundedRect(x, y, inset, radius) {
  const lo = inset;
  const hi = 1 - inset;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + radius), hi - radius);
  const cy = Math.min(Math.max(y, lo + radius), hi - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function render(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let outer = 0;
      let inner = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (inRoundedRect(x, y, 0.04, 0.22)) outer += 1;
          if (inRoundedRect(x, y, 0.3, 0.08)) inner += 1;
        }
      }
      const total = SAMPLES * SAMPLES;
      const mix = inner / total;
      const offset = py * stride + 1 + px * 4;
      for (let c = 0; c < 3; c += 1) {
        raw[offset + c] = Math.round(OUTER[c] * (1 - mix) + INNER[c] * mix);
      }
      raw[offset + 3] = Math.round((outer / total) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) writeFileSync(`${OUT}${size}.png`, render(size));
console.log(`Wrote ${SIZES.length} icons to ${OUT}`);
