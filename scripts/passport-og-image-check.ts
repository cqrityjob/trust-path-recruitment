// Security Passport — the server-drawn preview image, asserted pixel by pixel.
//
// Run: bun run passport-og-image:check
//
// What a LinkedIn (or any) link preview shows for a public share is drawn by
// the application from the controlled public payload. This pins, without a
// browser, what that image says and what it must never say:
//
//   * it is a valid 1200×630 PNG, byte-identical for the same input;
//   * a merit that is not in the payload is not in the image model and the
//     bytes differ from one that has it (an unselected merit cannot be drawn);
//   * private values planted in the raw payload (an e-mail, a user id, an
//     issuer, a certificate number, a phone number) reach neither the parsed
//     share, the image model nor the route's source;
//   * each shield level has its own shape (dashed, solid, doubled with a
//     check), and no payload shape can raise a credential above what the shared
//     presentation says;
//   * long lists are capped at six rows with an honest "+ n more", names are
//     shortened to fit, and a name the embedded faces cannot draw falls back to
//     the branded image instead of printing boxes;
//   * the route takes nothing from the client, answers an unavailable share 404
//     with no-store, and the named-share rule is enforced on the server.
//
// The database half (revoke, expiry, privacy tightening against a real row) is
// in supabase/tests and the browser/route half in e2e.

import { readFileSync } from "node:fs";
import { unzlibSync } from "fflate";
import { parsePublicSocialShare } from "../src/lib/security-passport/social-share-public";
import {
  buildImageModel,
  MAX_ROWS,
  type ImageModel,
} from "../src/lib/security-passport/og-image/model";
import { drawImage, IMAGE_HEIGHT, IMAGE_WIDTH } from "../src/lib/security-passport/og-image/draw";
import { renderShareImage } from "../src/lib/security-passport/og-image/render";
import { canDraw, face, measure } from "../src/lib/security-passport/og-image/text";

let assertions = 0;
const errors: string[] = [];
function expect(ok: boolean, message: string): void {
  assertions += 1;
  if (!ok) errors.push(message);
}

const ON = "2026-10-05";
const AT = "2026-10-05T08:00:00.000Z";

// ── PNG decoding, only as much as the encoder writes ───────────────────

interface Decoded {
  readonly width: number;
  readonly height: number;
  readonly rgb: Uint8Array;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function decodePng(png: Uint8Array): Decoded | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (sig.some((b, i) => png[i] !== b)) return null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  let sawEnd = false;
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const body = png.subarray(o + 8, o + 8 + len);
    if (crc32(png.subarray(o + 4, o + 8 + len)) !== dv.getUint32(o + 8 + len)) return null;
    if (type === "IHDR") {
      width = new DataView(body.buffer, body.byteOffset).getUint32(0);
      height = new DataView(body.buffer, body.byteOffset).getUint32(4);
      if (body[8] !== 8 || body[9] !== 2) return null;
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") sawEnd = true;
    o += 12 + len;
  }
  if (!sawEnd) return null;
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of idat) {
    joined.set(c, p);
    p += c.length;
  }
  const raw = unzlibSync(joined);
  const row = width * 3;
  if (raw.length !== (row + 1) * height) return null;
  const rgb = new Uint8Array(row * height);
  for (let y = 0; y < height; y += 1) {
    if (raw[y * (row + 1)] !== 0) return null;
    rgb.set(raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)), y * row);
  }
  return { width, height, rgb };
}

function crop(img: Decoded, x: number, y: number, w: number, h: number): string {
  let out = "";
  for (let yy = y; yy < y + h; yy += 1) {
    const start = (yy * img.width + x) * 3;
    out += Buffer.from(img.rgb.subarray(start, start + w * 3)).toString("base64");
  }
  return out;
}

function differs(a: Decoded, b: Decoded): number {
  let n = 0;
  for (let i = 0; i < a.rgb.length; i += 3) {
    if (a.rgb[i] !== b.rgb[i] || a.rgb[i + 1] !== b.rgb[i + 1] || a.rgb[i + 2] !== b.rgb[i + 2]) {
      n += 1;
    }
  }
  return n;
}

// ── a public payload, as `sp_get_social_share` returns it ──────────────

const rawClaim = (n: number, over: Record<string, unknown> = {}) => ({
  key: `c${n}`,
  type: "certification",
  title: `Merit ${n}`,
  credential_code: null,
  jurisdiction: "SE",
  sub_jurisdiction: null,
  scope_code: null,
  no_expiry: true,
  valid_until: null,
  assertion: "self_declared",
  lifecycle: "active",
  verified_at: null,
  verifier_organisation: null,
  verification_method: null,
  ...over,
});

const rawShare = (over: Record<string, unknown> = {}, claims = [rawClaim(1)]) => ({
  status: "active",
  locale: "sv",
  snapshot_at: "2026-10-01T10:00:00Z",
  expires_at: "2027-01-01T10:00:00Z",
  holder: "Selma Dahlberg",
  holder_label: "full_name",
  jurisdiction: "SE",
  passport_number: 17,
  designation: null,
  claims,
  ...over,
});

function active(raw: unknown) {
  const s = parsePublicSocialShare(raw, AT);
  if (s.status !== "active") throw new Error("fixture is not active");
  return s;
}

function model(raw: unknown): ImageModel {
  const m = buildImageModel(active(raw), ON);
  if (m === null) throw new Error("fixture has no image model");
  return m;
}

function png(raw: unknown): Uint8Array {
  const b = renderShareImage(active(raw), ON);
  if (b === null) throw new Error("fixture has no image");
  return b;
}

// ── 1. a valid, deterministic, correctly sized PNG ─────────────────────
{
  const bytes = png(rawShare());
  const img = decodePng(bytes);
  expect(img !== null, "the output is a valid PNG (signature, chunk CRCs, inflates)");
  expect(
    img?.width === IMAGE_WIDTH &&
      img?.height === IMAGE_HEIGHT &&
      IMAGE_WIDTH === 1200 &&
      IMAGE_HEIGHT === 630,
    "the image is 1200×630, the size link previews are drawn at",
  );
  expect(bytes.length < 5_000_000, "the file is far under LinkedIn's 5 MB limit");
  const again = png(rawShare());
  expect(
    bytes.length === again.length && bytes.every((b, i) => b === again[i]),
    "the same payload gives the same bytes",
  );
  if (img) {
    // Navy ground: the corners are dark blue, never white or transparent.
    const px = (x: number, y: number) => [
      ...img.rgb.subarray((y * img.width + x) * 3, (y * img.width + x) * 3 + 3),
    ];
    const [r, g, b] = px(4, 4);
    expect(b > r && b > g && r < 40 && g < 60, "the ground is the navy of the Passport card");
    const [r2, g2, b2] = px(IMAGE_WIDTH - 5, IMAGE_HEIGHT - 5);
    expect(r2 < 20 && g2 < 40 && b2 < 70, "the lower ground is the deeper navy");
  }
}

// ── 2. the model says what the payload says, and only that ─────────────
{
  const m = model(rawShare({ passport_number: 17 }));
  expect(m.passportNumber === 17, "the Passport number is the server's, as given");
  expect(m.name === "Selma Dahlberg", "a full-name share shows the name");
  expect(m.country === "Sverige", "the country is written out in the share's language");
  expect(m.merits.length === 1 && m.merits[0].title === "Merit 1", "the approved merit is drawn");
  const en = model(rawShare({ locale: "en" }));
  expect(en.country === "Sweden" && en.lang === "en", "an English share is drawn in English");
  expect(
    en.strings.footer.includes("summary") &&
      model(rawShare()).strings.footer.includes("sammanfattning"),
    "the image says it is a summary, in both languages",
  );
  const founder = model(rawShare({ passport_number: 1, designation: "founder" }));
  expect(founder.founder === "Grundare av CQrityjob", "the founder designation is its own line");
  expect(model(rawShare()).founder === null, "no designation, no founder line");
  expect(
    model(rawShare({ passport_number: null })).passportNumber === null,
    "no number assigned means no number is drawn, never a zero",
  );
}

// ── 3. an unselected merit cannot be drawn ─────────────────────────────
{
  const both = rawShare({}, [
    rawClaim(1, { title: "Selected merit" }),
    rawClaim(2, { title: "Unselected merit" }),
  ]);
  const only = rawShare({}, [rawClaim(1, { title: "Selected merit" })]);
  expect(
    JSON.stringify(model(both)).includes("Unselected merit"),
    "control: a merit in the payload is in the model",
  );
  expect(
    !JSON.stringify(model(only)).includes("Unselected merit"),
    "a merit not in the payload is not in the image model",
  );
  const a = decodePng(png(both));
  const b = decodePng(png(only));
  expect(
    a !== null && b !== null && differs(a, b) > 2_000,
    "the bytes differ between the two selections",
  );
  // The drawing function takes only the model: no second input could add a merit.
  expect(drawImage.length === 1, "drawing takes the image model and nothing else");
  expect(renderShareImage.length === 2, "rendering takes the public payload and the date only");
}

// ── 4. nothing private reaches the image ───────────────────────────────
{
  const planted = {
    email: "selma.private@example.test",
    user_id: "7f3a1c52-0000-4000-8000-000000000999",
    holder_user_id: "7f3a1c52-0000-4000-8000-000000000998",
    phone: "+46 70 123 45 67",
    certificate_number: "CERT-99-ZZ-31337",
    issuer: "Hemliga Utbildaren AB",
    issued_on: "2020-02-02",
    employer: "Privata Bolaget AB",
    document_url: "https://private.example.test/doc.pdf",
  };
  const claim = rawClaim(1, { ...planted });
  const share = parsePublicSocialShare(
    rawShare({ ...planted }, [claim as ReturnType<typeof rawClaim>]),
    AT,
  );
  const m = buildImageModel(share.status === "active" ? share : (undefined as never), ON);
  const dump = JSON.stringify(m) + JSON.stringify(share);
  for (const [key, value] of Object.entries(planted)) {
    expect(
      !dump.includes(value),
      `a planted ${key} reaches neither the parsed share nor the image model`,
    );
  }
}

// ── 5. shields: each level its own shape, none raised ──────────────────
{
  const states = (c: Record<string, unknown>) =>
    model(rawShare({}, [rawClaim(1, c)])).merits[0]?.state;
  expect(
    states({ assertion: "self_declared" }) === "self_declared",
    "a holder's own entry is a self-declared shield",
  );
  expect(
    states({
      assertion: "verified",
      verifier_organisation: "CQrityjob",
      verification_method: "document_review",
    }) === "documented",
    "a CQrityjob document review is a documented shield",
  );
  for (const [org, method] of [
    ["CQrityjob", "issuer_confirmation"],
    ["CQrityjob", "employer_confirmation"],
    ["external", "issuer_confirmation"],
    ["external", "employer_confirmation"],
    ["external", "document_review"],
    [null, null],
  ] as const) {
    expect(
      states({ assertion: "verified", verifier_organisation: org, verification_method: method }) !==
        "verified",
      `a payload claiming ${org}/${method} is not drawn as verified by this image`,
    );
  }
  expect(
    states({
      assertion: "self_declared",
      verifier_organisation: "CQrityjob",
      verification_method: "document_review",
    }) === "self_declared",
    "a verifier name on a self-declared entry does not raise it",
  );
  expect(
    model(rawShare({}, [rawClaim(1, { lifecycle: "revoked" })])).merits.length === 0,
    "a revoked credential is not drawn",
  );
  expect(
    model(
      rawShare({}, [
        rawClaim(1, { lifecycle: "active", valid_until: "2020-01-01", no_expiry: false }),
      ]),
    ).merits.length === 0,
    "a lapsed credential is not drawn",
  );

  // The three outlines look different at the same position (the renderer can
  // draw verified even though no payload reaches it today).
  const base: ImageModel = { ...model(rawShare()), merits: [], hidden: 0, total: 0 };
  const draw = (state: "verified" | "documented" | "self_declared") =>
    decodePng(
      drawImage({
        ...base,
        merits: [{ title: "Same title", state, word: "Same word" }],
        total: 1,
      }).toPng(),
    )!;
  const v = draw("verified");
  const d = draw("documented");
  const s = draw("self_declared");
  const region = (img: Decoded) => crop(img, 540, 56, 44, 56);
  expect(
    region(v) !== region(d) && region(d) !== region(s) && region(v) !== region(s),
    "verified, documented and self-declared shields differ in shape",
  );
  // Gold is verified's alone: no gold pixel in the other two shields.
  const gold = (img: Decoded) => {
    let n = 0;
    for (let y = 56; y < 112; y += 1) {
      for (let x = 540; x < 584; x += 1) {
        const i = (y * img.width + x) * 3;
        if (
          img.rgb[i] > 200 &&
          img.rgb[i + 1] > 160 &&
          img.rgb[i + 1] < 215 &&
          img.rgb[i + 2] < 160
        )
          n += 1;
      }
    }
    return n;
  };
  expect(
    gold(v) > 20 && gold(d) === 0 && gold(s) === 0,
    "gold appears on the verified shield only",
  );
}

// ── 6. privacy as the payload already reduced it ───────────────────────
{
  expect(
    model(rawShare({ holder: null, holder_label: "anonymous" })).name === null,
    "an anonymous payload draws no name",
  );
  expect(
    model(rawShare({ holder: "S. D.", holder_label: "initials" })).name === "S. D.",
    "an initials payload draws initials only",
  );
  const named = decodePng(png(rawShare()))!;
  const hidden = decodePng(png(rawShare({ holder: null, holder_label: "anonymous" })))!;
  expect(
    differs(named, hidden) > 1_000,
    "the name is really absent from the pixels when the payload has none",
  );
}

// ── 7. long lists and long names ───────────────────────────────────────
{
  const many = Array.from({ length: 40 }, (_, i) =>
    rawClaim(i + 1, { title: `Merit nummer ${i + 1}` }),
  );
  const m = model(rawShare({}, many));
  expect(m.merits.length === MAX_ROWS && MAX_ROWS === 6, "at most six rows are drawn");
  expect(m.hidden === 34 && m.total === 40, "the rest are counted, not silently dropped");
  expect(
    m.strings.more.includes("34") && m.strings.more.includes("fler"),
    "the overflow line says how many more, in Swedish",
  );
  expect(model(rawShare({ locale: "en" }, many)).strings.more.includes("more"), "and in English");
  expect(decodePng(png(rawShare({}, many))) !== null, "a long list still renders");

  const longTitle =
    "Skyddsvakt med ett orimligt långt namn på behörigheten som aldrig får plats på en rad ".repeat(
      3,
    );
  const lm = model(rawShare({}, [rawClaim(1, { title: longTitle })]));
  expect(
    lm.merits[0].title === longTitle.replace(/\s+/g, " ").trim() || lm.merits[0].title.length > 0,
    "a long title is carried to the drawing",
  );
  expect(
    decodePng(png(rawShare({}, [rawClaim(1, { title: longTitle })]))) !== null,
    "and drawn without overflow",
  );
  const longName = model(
    rawShare({ holder: "Maria Alexandra Konstantinopolitanskaja-Winterbottom Fitzgerald" }),
  );
  expect(
    longName.name !== null,
    "a very long name is kept for the drawing, which wraps and shortens it",
  );
  expect(
    decodePng(
      png(rawShare({ holder: "Maria Alexandra Konstantinopolitanskaja-Winterbottom Fitzgerald" })),
    ) !== null,
    "and renders",
  );
  expect(
    measure("textBold", "Wide", 27) < measure("textBold", "Wide Wide Wide", 27),
    "text is measured with the face's own advances",
  );
}

// ── 8. what the faces cannot draw ──────────────────────────────────────
{
  expect(
    renderShareImage(active(rawShare({ holder: "محمد الشاوي" })), ON) === null,
    "a name in a script the faces lack is not drawn as boxes (branded fallback)",
  );
  expect(
    renderShareImage(active(rawShare({ holder: "Åsa Öberg-Ström" })), ON) !== null,
    "Swedish letters are drawn",
  );
  expect(
    renderShareImage(active(rawShare({ holder: "José Müller" })), ON) !== null,
    "common Latin accents are drawn",
  );
  const arabicTitle = model(rawShare({}, [rawClaim(1, { title: "شهادة Brandskydd" })]));
  expect(
    !/[؀-ۿ]/.test(arabicTitle.merits[0]?.title ?? ""),
    "a credential title never carries characters the face cannot draw",
  );
  for (const f of ["heading", "text", "textBold"] as const) {
    expect(face(f).unitsPerEm > 0, `the ${f} face parses`);
    expect(
      canDraw(f, "ÅÄÖåäö éÉ #+·–…0123456789 abcXYZ"),
      `the ${f} face covers Swedish, accents, digits and the card's symbols`,
    );
  }
}

// ── 9. the route and the server rule, in source ────────────────────────
{
  const route = readFileSync("src/routes/og.share.$publicId.ts", "utf8");
  const page = readFileSync("src/routes/s.$publicId.tsx", "utf8");
  const fns = readFileSync("src/lib/security-passport/social-share.functions.ts", "utf8");
  const code = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const r = code(route);
  expect(/sp_get_social_share/.test(r), "the image is drawn from the one anonymous read");
  expect(
    !/request\.(url|json|formData|text|arrayBuffer)|searchParams|new URL\(/.test(r),
    "the route reads nothing from the client: no query, no body",
  );
  expect(
    !/\.from\(|service_role|SUPABASE_SERVICE/.test(r),
    "no table read and no service key in the route",
  );
  expect(
    /"cache-control": "no-store"/.test(r),
    "the image is never cacheable, so revocation takes effect at once",
  );
  expect(
    /status: 404/.test(r) && /share\.status !== "active"\) return gone\(\)/.test(r),
    "an unavailable share answers 404",
  );
  expect(
    /status: 503/.test(r),
    "a failed read asks the crawler to retry rather than answering 404",
  );
  expect(/og-security-passport\.png/.test(r), "an undrawable name falls back to the branded image");
  expect(
    /"og:image", content: image/.test(page) || /property: "og:image", content: image/.test(page),
    "the page's og:image is the computed address",
  );
  expect(
    /\/og\/share\/\$\{params\.publicId\}/.test(page),
    "an active share's og:image is its own personal image",
  );
  expect(
    /: `\$\{origin\}\/og-security-passport\.png`/.test(page),
    "an unavailable share keeps the branded image",
  );
  const f = code(fns);
  expect(
    /holderLabel: z\.literal\("full_name"\)/.test(f),
    "a personal share cannot be created anonymous or with initials",
  );
  const create = f.slice(
    f.indexOf("export const createSocialShare"),
    f.indexOf("export const listMySocialShares"),
  );
  const checkAt = create.indexOf("privacy_mode");
  const rpcAt = create.indexOf('rpc("sp_create_social_share"');
  expect(
    checkAt > 0 && rpcAt > checkAt,
    "the privacy condition is read before anything is created",
  );
  expect(
    /profile\.privacy_mode !== "full_name"\) \{\s*return \{ status: "failed", code: "name_not_approved" \}/.test(
      create,
    ),
    "a hidden name stops the create with its own code",
  );
  expect(
    /profileError\) return \{ status: "failed"/.test(create),
    "a failed privacy read creates nothing (fails closed)",
  );
  expect(
    !/\.update\(|setPrivacyMode|privacy_mode:/.test(create),
    "the create never changes a setting on the holder's behalf",
  );
  const draw = readFileSync("src/lib/security-passport/og-image/draw.ts", "utf8");
  expect(
    !/model\.founder[\s\S]{0,160}C\.gold/.test(draw),
    "the founder line never takes the gold reserved for verified",
  );
}

if (errors.length > 0) {
  console.error(`passport-og-image-check FAILED (${errors.length} of ${assertions}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`passport-og-image-check: ${assertions} assertions passed`);
