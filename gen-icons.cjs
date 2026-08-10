const fs = require('fs');

function createMinimalPNG(size, color1 = [102, 126, 234], color2 = [118, 75, 162]) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const width = size;
  const height = size;
  const bitDepth = 8;
  const colorType = 2; // RGB
  const compression = 0;
  const filter = 0;
  const interlace = 0;
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = bitDepth;
  ihdrData[9] = colorType;
  ihdrData[10] = compression;
  ihdrData[11] = filter;
  ihdrData[12] = interlace;
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // Image data - simple gradient
  const rawData = Buffer.alloc(height * (width * 3 + 1));
  let offset = 0;
  
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte
    
    for (let x = 0; x < width; x++) {
      const t = (x + y) / (width + height);
      const r = Math.round(color1[0] * (1 - t) + color2[0] * t);
      const g = Math.round(color1[1] * (1 - t) + color2[1] * t);
      const b = Math.round(color1[2] * (1 - t) + color2[2] * t);
      
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
    }
  }
  
  const idatChunk = createChunk('IDAT', rawData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = crc32(typeAndData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeAndData, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  
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

// Generate icons
const icon192 = createMinimalPNG(192);
const icon512 = createMinimalPNG(512);

fs.writeFileSync('public/icon-192.png', icon192);
fs.writeFileSync('public/icon-512.png', icon512);

console.log('✅ Generated icon-192.png and icon-512.png');
