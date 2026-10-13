// Gulapps ikoner, ritade i kod: en gul sol (som Gulnux logga) och agentens status som en
// prick – som snurrar runt solen när agenten arbetar. Ger PNG (ikonen i aktivitetsfältet)
// och ICO (genvägen i Start-menyn).

import zlib from "node:zlib";

const YELLOW = [0xf5, 0xc5, 0x18];
const AMBER = [0x8a, 0x61, 0x00];
const GREY = [0xb8, 0xb2, 0xa3];
const RED = [0xd9, 0x48, 0x0f];

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bitar, RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Ritar cirklar (x, y, r i delar av bilden) med kantutjämning genom översampling
function draw(size, circles) {
  const out = Buffer.alloc(size * size * 4);
  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S) / size;
          const py = (y + (sy + 0.5) / S) / size;
          // den sista cirkeln som täcker punkten vinner
          const hit = circles.findLast((c) => (px - c.x) ** 2 + (py - c.y) ** 2 <= c.r ** 2);
          if (hit) {
            r += hit.color[0];
            g += hit.color[1];
            b += hit.color[2];
            a += 255;
          }
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      const cov = a / n;
      out[i] = cov ? (r / n) * (255 / cov) : 0;
      out[i + 1] = cov ? (g / n) * (255 / cov) : 0;
      out[i + 2] = cov ? (b / n) * (255 / cov) : 0;
      out[i + 3] = cov;
    }
  }
  return out;
}

// state: off, idle, working, attention. frame: 0–7, var pricken står när agenten arbetar.
export function statusIcon(state, size = 32, frame = 0) {
  const sun = [
    { x: 0.5, y: 0.5, r: 0.44, color: state === "off" ? GREY : AMBER },
    { x: 0.5, y: 0.5, r: 0.36, color: state === "off" ? GREY.map((c) => Math.min(255, c + 30)) : YELLOW },
  ];
  if (state === "working") {
    const angle = (frame / 8) * 2 * Math.PI - Math.PI / 2;
    const [x, y] = [0.5 + 0.32 * Math.cos(angle), 0.5 + 0.32 * Math.sin(angle)];
    sun.push({ x, y, r: 0.15, color: [255, 255, 255] }, { x, y, r: 0.11, color: AMBER });
  } else if (state === "attention") {
    sun.push({ x: 0.76, y: 0.76, r: 0.22, color: [255, 255, 255] }, { x: 0.76, y: 0.76, r: 0.17, color: RED });
  }
  return png(size, draw(size, sun));
}

// En ICO med PNG-bilder i (Windows Vista och senare)
export function appIco(sizes = [16, 32, 48, 256]) {
  const images = sizes.map((s) => statusIcon("idle", s));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header[e] = s >= 256 ? 0 : s;
    header[e + 1] = s >= 256 ? 0 : s;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}
