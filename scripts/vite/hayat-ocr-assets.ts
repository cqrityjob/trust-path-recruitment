// HAYAT — serve the OCR engine from this application's own origin.
//
// Tesseract.js, left alone, downloads its worker script, its WASM core and its
// language data from cdn.jsdelivr.net the first time it runs. For a feature
// that reads a candidate's private certificate, "the first thing it does is
// fetch executable code from a third-party CDN" is the wrong default: it is a
// supply-chain dependency at run time, it tells a third party when a holder is
// adding a credential, and it breaks the moment that CDN is blocked.
//
// So the exact files the lockfile pins are published under /hayat-ocr/:
//
//   /hayat-ocr/worker.min.js                     tesseract.js
//   /hayat-ocr/core/tesseract-core-*-lstm.wasm.js tesseract.js-core (LSTM only)
//   /hayat-ocr/lang/{swe,eng}.traineddata.gz     @tesseract.js-data (best_int)
//
// Fixed names, not hashed ones, because the worker builds these URLs itself
// from a directory and a language code. They are copied from node_modules at
// build time and served from node_modules in dev; nothing binary is committed.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

export const HAYAT_OCR_PUBLIC_BASE = "/hayat-ocr";

/** published path (under the base) -> absolute source file */
export function hayatOcrAssetMap(): Record<string, string> {
  const core = packageDir("tesseract.js-core");
  const out: Record<string, string> = {
    "worker.min.js": join(packageDir("tesseract.js"), "dist", "worker.min.js"),
  };
  // The three LSTM-only builds the worker chooses between by CPU feature.
  for (const build of ["relaxedsimd-lstm", "simd-lstm", "lstm"])
    out[`core/tesseract-core-${build}.wasm.js`] = join(core, `tesseract-core-${build}.wasm.js`);
  // Apache-2.0 redistribution: the licence texts travel with the binaries.
  out["licenses/tesseract.js-LICENSE.md"] = join(packageDir("tesseract.js"), "LICENSE.md");
  out["licenses/tesseract.js-core-LICENSE.txt"] = join(core, "LICENSE");
  for (const lang of ["swe", "eng"])
    out[`lang/${lang}.traineddata.gz`] = join(
      packageDir(`@tesseract.js-data/${lang}`),
      "4.0.0_best_int",
      `${lang}.traineddata.gz`,
    );
  return out;
}

/** Exact versions and licences of what is published, read from the packages. */
function notice(): string {
  const packages = [
    "tesseract.js",
    "tesseract.js-core",
    "@tesseract.js-data/swe",
    "@tesseract.js-data/eng",
  ];
  const lines = packages.map((name) => {
    const meta = JSON.parse(readFileSync(join(packageDir(name), "package.json"), "utf8")) as {
      version: string;
      license?: string;
    };
    return `${name}@${meta.version} -- ${meta.license ?? "see package"}`;
  });
  return [
    "Third-party OCR components served under /hayat-ocr/, unmodified:",
    "",
    ...lines,
    "",
    "Language data derives from the Tesseract OCR tessdata project (Apache-2.0).",
    "Licence texts: ./licenses/",
    "",
  ].join("\n");
}

export function hayatOcrAssets(): Plugin {
  const assets = hayatOcrAssetMap();
  return {
    name: "hayat-ocr-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (!path.startsWith(`${HAYAT_OCR_PUBLIC_BASE}/`)) return next();
        const source = assets[path.slice(HAYAT_OCR_PUBLIC_BASE.length + 1)];
        if (!source) return next();
        // No Content-Encoding on the .gz: the worker gunzips it itself.
        res.setHeader(
          "Content-Type",
          path.endsWith(".js") ? "text/javascript" : "application/octet-stream",
        );
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(source));
      });
    },
    generateBundle() {
      // Once, into the browser build only.
      if (this.environment && this.environment.name !== "client") return;
      this.emitFile({
        type: "asset",
        fileName: `${HAYAT_OCR_PUBLIC_BASE.slice(1)}/NOTICE.txt`,
        source: notice(),
      });
      for (const [published, source] of Object.entries(assets))
        this.emitFile({
          type: "asset",
          fileName: `${HAYAT_OCR_PUBLIC_BASE.slice(1)}/${published}`,
          source: readFileSync(source),
        });
    },
  };
}
