const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// -------------------- Minimal PNG generator --------------------
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcData));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPNG(width, height, pixelCB) {
  // pixelCB(x, y) => { r, g, b, a }
  const rowBytes = 1 + width * 4; // filter byte + RGBA pixels
  const rawData = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const p = pixelCB(x, y);
      const off = rowOffset + 1 + x * 4;
      rawData[off]     = p.r;
      rawData[off + 1] = p.g;
      rawData[off + 2] = p.b;
      rawData[off + 3] = p.a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------- Icon drawing --------------------
const BLUE  = { r: 0x4A, g: 0x90, b: 0xD9, a: 255 }; // #4A90D9
const WHITE = { r: 255,  g: 255,  b: 255,  a: 255 };
const TRANS = { r: 0,    g: 0,    b: 0,    a: 0 };

function makeIcon(size) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 0.5;

  // T letter geometry (proportional to size)
  const tBarThick  = Math.max(1, Math.round(size * 0.18));   // thickness of bars
  const tBarWidth  = Math.round(size * 0.62);                // width of top bar
  const tStemHeight = Math.round(size * 0.48);               // height of stem
  const barTop     = Math.round(size * 0.22);                // Y of top bar
  const barLeft    = Math.round((size - tBarWidth) / 2);     // X of top bar
  const stemLeft   = Math.round((size - tBarThick) / 2);     // X of stem

  return createPNG(size, size, (x, y) => {
    // 1. Check if inside circle
    const dx = x - cx + 0.5;
    const dy = y - cy + 0.5;
    const inside = (dx * dx + dy * dy) <= (radius * radius);

    if (!inside) return TRANS;

    // 2. Check if inside "T" letter
    const inTopBar  = (y >= barTop && y < barTop + tBarThick && x >= barLeft && x < barLeft + tBarWidth);
    const inStem    = (x >= stemLeft && x < stemLeft + tBarThick && y >= barTop && y < barTop + tStemHeight);

    if (inTopBar || inStem) {
      return WHITE;
    }

    return BLUE;
  });
}

// -------------------- Main --------------------
const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 48, 128];
for (const size of sizes) {
  const png = makeIcon(size);
  const filePath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  const stat = fs.statSync(filePath);
  console.log(`Created ${filePath}  (${stat.size} bytes, ${size}x${size})`);
}
