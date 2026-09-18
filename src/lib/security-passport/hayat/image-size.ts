// HAYAT — an image's dimensions, read from its header BEFORE it is decoded.
//
// Decoding is where the memory goes. A PNG that is 2 MB on disk can declare
// 20 000 x 20 000 pixels; asking the browser to decode it is already the
// damage. So the pixel budget is checked against the header, where reading it
// costs a few bytes, and an image that lies about or hides its size is simply
// not decoded.

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export function readImageSize(bytes: Uint8Array, mimeType: string): ImageSize | null {
  if (mimeType === "image/png") return pngSize(bytes);
  if (mimeType === "image/jpeg") return jpegSize(bytes);
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || PNG_SIGNATURE.some((v, i) => b[i] !== v)) return null;
  // IHDR is required to be the first chunk.
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const size = { width: view.getUint32(16), height: view.getUint32(20) };
  return size.width > 0 && size.height > 0 ? size : null;
}

function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) return null;
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    // Start-of-frame markers carry the dimensions; C4, C8 and CC are not frames.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      const size = { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      return size.width > 0 && size.height > 0 ? size : null;
    }
    // Standalone markers have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}
