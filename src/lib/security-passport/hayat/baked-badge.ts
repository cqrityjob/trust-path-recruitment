// HAYAT — finding a signed credential inside an ordinary PNG.
//
// Open Badges "baking" puts the credential itself into the image: a PNG `iTXt`
// chunk whose keyword is `openbadgecredential` (Open Badges 3.0) holds either
// a compact JWS or the credential JSON. It is the one signed format that
// arrives through the existing "Välj fil" control with no new file type, no
// new bucket rule and no new upload path.
//
// This only FINDS the text. Whether it means anything is decided on the
// server (./verification); until then it is an untrusted string.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEYWORD = "openbadgecredential";

/** A credential far larger than this is not a credential. */
export const BAKED_CREDENTIAL_MAX_CHARS = 65_536;

export async function extractBakedCredential(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length < 16 || PNG_SIGNATURE.some((v, i) => bytes[i] !== v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder("latin1");
  let offset = 8;
  // Bounded walk: a PNG with thousands of chunks is not worth the search.
  for (let guard = 0; guard < 4096 && offset + 12 <= bytes.length; guard += 1) {
    const length = view.getUint32(offset);
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8));
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) return null;
    if (type === "iTXt") {
      const text = await readInternationalText(bytes.subarray(start, end));
      if (text !== null) return text;
    }
    if (type === "IEND") return null;
    offset = end + 4; // skip the CRC
  }
  return null;
}

async function readInternationalText(chunk: Uint8Array): Promise<string | null> {
  const nul = (from: number) => chunk.indexOf(0, from);
  const keywordEnd = nul(0);
  if (keywordEnd < 0) return null;
  if (new TextDecoder("latin1").decode(chunk.subarray(0, keywordEnd)) !== KEYWORD) return null;
  const compressed = chunk[keywordEnd + 1] === 1;
  if (compressed && chunk[keywordEnd + 2] !== 0) return null; // only deflate is defined
  const languageEnd = nul(keywordEnd + 3);
  if (languageEnd < 0) return null;
  const translatedEnd = nul(languageEnd + 1);
  if (translatedEnd < 0) return null;
  let payload = chunk.subarray(translatedEnd + 1);
  if (compressed) {
    const inflated = await inflate(payload);
    if (!inflated) return null;
    payload = inflated;
  }
  if (payload.length === 0 || payload.length > BAKED_CREDENTIAL_MAX_CHARS * 4) return null;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(payload).trim();
  return text.length > 0 && text.length <= BAKED_CREDENTIAL_MAX_CHARS ? text : null;
}

/** zlib inflate with an output cap, so a compressed chunk cannot be a bomb. */
async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > BAKED_CREDENTIAL_MAX_CHARS * 4) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}
