// Synthetic documents for the HAYAT browser suite.
//
// Every document here is generated at test time from the HTML below. Nothing
// is a real certificate, no name is a real person, and the "issuer" on the
// Swedish one does not exist. No binary fixture is committed.

import type { Browser } from "@playwright/test";

export interface CertificateText {
  readonly issuer: string;
  readonly title: string;
  readonly intro: string;
  readonly holder: string;
  readonly rows: readonly (readonly [string, string])[];
  /** A line that must never appear in any request the browser makes. */
  readonly marker: string;
}

export const ENGLISH_CPP: CertificateText = {
  issuer: "ASIS International",
  title: "Certified Protection Professional",
  intro: "This is to certify that",
  holder: "Test Holder Synthetic",
  rows: [
    ["Certificate No:", "7741-2291-86"],
    ["Date of issue:", "12 March 2024"],
    ["Valid until:", "31 March 2027"],
  ],
  marker: "SYNTHETIC-DOCUMENT-MARKER-EN",
};

export const ENGLISH_PSP: CertificateText = {
  ...ENGLISH_CPP,
  title: "Physical Security Professional",
  rows: [
    ["Certificate No:", "5520-1187-03"],
    ["Date of issue:", "2 May 2023"],
    ["Valid until:", "31 May 2026"],
  ],
  marker: "SYNTHETIC-DOCUMENT-MARKER-PSP",
};

export const SWEDISH_CPP: CertificateText = {
  issuer: "ASIS International",
  title: "Certified Protection Professional",
  intro: "Härmed intygas att",
  holder: "Test Holder Synthetic",
  rows: [
    ["Certifikatnummer:", "3318-9920-45"],
    ["Utfärdad den", "3 april 2025"],
    ["Giltig till", "2028-04-02"],
  ],
  marker: "SYNTHETIC-DOCUMENT-MARKER-SV",
};

export const AMBIGUOUS: CertificateText = {
  ...ENGLISH_CPP,
  rows: [
    ["Certificate No:", "9090-4411-27"],
    ["Issued:", "03/04/2026"],
  ],
  marker: "SYNTHETIC-DOCUMENT-MARKER-AMBIGUOUS",
};

const html = (c: CertificateText) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}
  main{width:1000px;padding:70px 80px;box-sizing:border-box}
  h1{font-size:44px;margin:0 0 30px} h2{font-size:38px;margin:26px 0}
  p{font-size:30px;margin:18px 0} .m{font-size:20px;margin-top:60px}
</style></head><body><main>
  <h1>${c.issuer}</h1>
  <p>${c.intro} ${c.holder}</p>
  <h2>${c.title}</h2>
  ${c.rows.map(([k, v]) => `<p>${k} ${v}</p>`).join("\n")}
  <p class="m">${c.marker}</p>
</main></body></html>`;

export interface Fixtures {
  readonly textPdf: (c: CertificateText) => Promise<Buffer>;
  readonly png: (c: CertificateText, rotateDegrees?: number) => Promise<Buffer>;
  readonly jpeg: (c: CertificateText) => Promise<Buffer>;
  readonly scannedPdf: (c: CertificateText) => Promise<Buffer>;
  readonly close: () => Promise<void>;
}

export async function createFixtures(browser: Browser): Promise<Fixtures> {
  const context = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  const page = await context.newPage();
  const shot = async (c: CertificateText, type: "png" | "jpeg", rotate = 0) => {
    await page.setContent(html(c));
    if (rotate)
      await page.addStyleTag({
        content: `main{transform:rotate(${rotate}deg);transform-origin:50% 50%;margin-top:120px}`,
      });
    return page.screenshot({ type, fullPage: true, ...(type === "jpeg" ? { quality: 92 } : {}) });
  };
  return {
    textPdf: async (c) => {
      await page.setContent(html(c));
      return page.pdf({ width: "1000px", height: "760px", printBackground: true });
    },
    png: (c, rotate) => shot(c, "png", rotate),
    jpeg: (c) => shot(c, "jpeg"),
    scannedPdf: async (c) => imagePdf(await shot(c, "jpeg"), 1000, 760),
    close: () => context.close(),
  };
}

/** A one-page PDF whose only content is a JPEG: what a scanner produces. */
export function imagePdf(jpeg: Buffer, width: number, height: number): Buffer {
  const objects: Buffer[] = [];
  const add = (body: string | Buffer) =>
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  add(
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        "latin1",
      ),
      jpeg,
      Buffer.from("\nendstream", "latin1"),
    ]),
  );
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  return assemble(objects, "");
}

/** A PDF that demands a password. The /O and /U values are arbitrary, so the
 *  empty password can never match and no real cryptography is involved. */
export function passwordProtectedPdf(): Buffer {
  const filler = "00112233445566778899aabbccddeeff".repeat(2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    `<< /Filter /Standard /V 1 /R 2 /O <${filler}> /U <${filler.split("").reverse().join("")}> /P -44 >>`,
  ].map((o) => Buffer.from(o, "latin1"));
  return assemble(
    objects,
    " /Encrypt 4 0 R /ID [<0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef>]",
  );
}

function assemble(objects: readonly Buffer[], trailerExtra: string): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n", "latin1")];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailerExtra} >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}

/** Bake an Open Badges 3.0 credential string into a PNG (uncompressed iTXt). */
export function bakeCredential(png: Buffer, credential: string): Buffer {
  const data = Buffer.concat([
    Buffer.from("openbadgecredential\0", "latin1"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(credential, "utf8"),
  ]);
  const type = Buffer.from("iTXt", "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const iend = png.length - 12; // IEND is always the last 12 bytes
  return Buffer.concat([png.subarray(0, iend), length, type, data, crc, png.subarray(iend)]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
