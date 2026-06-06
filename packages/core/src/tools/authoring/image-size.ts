/**
 * Minimal image dimension + type sniffer (PNG / JPEG / GIF / BMP).
 *
 * The docx `ImageRun` needs an explicit type and pixel transformation, and we
 * want to preserve aspect ratio when only a target width is given — so we read
 * the intrinsic size straight from the file header. No image library needed
 * (pngjs is a core dep but this covers JPEG/GIF/BMP too, and avoids decoding the
 * whole bitmap just to read two numbers).
 */

export type ImageType = 'png' | 'jpg' | 'gif' | 'bmp';

export interface ImageSize {
  width: number;
  height: number;
  type: ImageType;
}

export function getImageSize(buf: Buffer): ImageSize | null {
  if (buf.length < 24) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height as big-endian uint32.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  }

  // GIF: "GIF8", width/height little-endian uint16.
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' };
  }

  // BMP: "BM", width/height little-endian int32 at 18/22.
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)), type: 'bmp' };
  }

  // JPEG: FF D8, scan for a Start-Of-Frame marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      // SOF0..SOF15 carry the frame size, excluding DHT(C4)/JPG(C8)/DAC(CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7), type: 'jpg' };
      }
      // Skip this segment by its length field.
      const len = buf.readUInt16BE(off + 2);
      if (len < 2) break;
      off += 2 + len;
    }
  }

  return null;
}
