// Regenerates public/og-security-passport.png from source.
//
// The image is rasterised in a real browser from `buildGenericOgSvg`, so the
// committed asset is provably the same drawing as every other Passport
// surface rather than something separately hand-made that drifts.
//
// It is GENERIC by design: no holder name, no credential, no milestone. See
// the function's own comment for why a personalised og:image would be a
// public artifact that outlives the share it came from.
//
// Requires the dev server (npm run dev) so Vite can serve the TypeScript
// module, then:
//   node scripts/generate-og-image.mjs
//
// Optional: OG_BASE_URL (default http://localhost:8080)

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.OG_BASE_URL ?? "http://localhost:8080";
const OUT = path.resolve(import.meta.dirname, "../public/og-security-passport.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

// The dev route is the only page guaranteed to have the module graph loaded.
await page.goto(`${BASE}/dev/security-passport`, { waitUntil: "domcontentloaded" });

const dataUrl = await page.evaluate(async () => {
  const mod = await import("/src/lib/security-passport/social-export.ts");
  const svg = mod.buildGenericOgSvg({
    brand: "CQrityjob",
    title: "Security Passport",
    // Bilingual on one image: the link is shared by Swedish holders and read
    // by an international audience, and a preview cannot negotiate language.
    subtitle:
      "Verifierade yrkesuppgifter, delade av innehavaren. / Verified professional records, shared by the holder.",
    note: "Öppna länken för aktuell status. / Open the link for current status.",
  });
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  canvas.getContext("2d").drawImage(img, 0, 0, 1200, 630);
  return canvas.toDataURL("image/png");
});

writeFileSync(OUT, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log(`wrote ${OUT}`);
