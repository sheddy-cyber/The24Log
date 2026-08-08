import fs from 'fs';
import zlib from 'zlib';

function createPNG(width, height, renderPixel) {
  const rowSize = width * 4 + 1;
  const buffer = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    buffer[rowOffset] = 0; // Filter type 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      buffer[pxOffset] = r;
      buffer[pxOffset + 1] = g;
      buffer[pxOffset + 2] = b;
      buffer[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(buffer);

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      let c = (crc ^ byte) & 0xff;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ -1) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

// 7x9 crisp font grid for '2' and '4'
const glyph2 = [
  " 01110 ",
  "1000011",
  "0000011",
  "0000110",
  "0001100",
  "0011000",
  "0110000",
  "1111111",
  "1111111"
];

const glyph4 = [
  "0000110",
  "0001110",
  "0010110",
  "0100110",
  "1111111",
  "1111111",
  "0000110",
  "0000110",
  "0000110"
];

function draw24CircleIcon(x, y, w, h) {
  const bg = [0x11, 0x1c, 0x31, 0xff];
  const teal = [0x9c, 0xe3, 0xca, 0xff];

  // Circle radius and center
  const cx = w / 2;
  const cy = h / 2;
  const radius = w * 0.36;
  const stroke = w * 0.045;

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Outer circle ring
  if (Math.abs(dist - radius) <= stroke / 2) {
    return teal;
  }

  // Draw '2' and '4' perfectly centered on both X and Y
  const digitHeight = 9;
  const digitWidth = 7;
  const gap = 2;
  const totalGridWidth = digitWidth + gap + digitWidth; // 16
  const scale = (w * 0.38) / digitHeight;

  const totalPixelWidth = totalGridWidth * scale;
  const totalPixelHeight = digitHeight * scale;

  const startX = cx - totalPixelWidth / 2;
  const startY = cy - totalPixelHeight / 2;

  // Check digit '2'
  const lx2 = (x - startX) / scale;
  const ly2 = (y - startY) / scale;
  if (lx2 >= 0 && lx2 < digitWidth && ly2 >= 0 && ly2 < digitHeight) {
    const gx = Math.floor(lx2);
    const gy = Math.floor(ly2);
    if (glyph2[gy] && glyph2[gy][gx] === '1') {
      return teal;
    }
  }

  // Check digit '4'
  const lx4 = (x - (startX + (digitWidth + gap) * scale)) / scale;
  const ly4 = (y - startY) / scale;
  if (lx4 >= 0 && lx4 < digitWidth && ly4 >= 0 && ly4 < digitHeight) {
    const gx = Math.floor(lx4);
    const gy = Math.floor(ly4);
    if (glyph4[gy] && glyph4[gy][gx] === '1') {
      return teal;
    }
  }

  return bg;
}

const icon192 = createPNG(192, 192, draw24CircleIcon);
fs.writeFileSync('./icon-192.png', icon192);

const icon512 = createPNG(512, 512, draw24CircleIcon);
fs.writeFileSync('./icon-512.png', icon512);

console.log('Centered 24 Circle App Icons generated!');
