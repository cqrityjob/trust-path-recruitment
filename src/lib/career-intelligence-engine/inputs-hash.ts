// Deterministic FNV-1a hash of an answer map. Pure JS, no crypto dependency,
// stable across Node and browser. Used to fingerprint the exact inputs that
// produced an EngineResultV1 so a future Career Journey can detect when to
// recompute.

import type { AnswerMap } from "@/lib/career-assessment/types";
import { ENGINE_VERSION } from "./types";

function stableStringify(obj: AnswerMap): string {
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    let s: string;
    if (Array.isArray(v)) s = "[" + [...v].sort().join(",") + "]";
    else s = String(v);
    parts.push(k + "=" + s);
  }
  return parts.join("|");
}

export function hashInputs(answers: AnswerMap): string {
  const body = ENGINE_VERSION + "::" + stableStringify(answers);
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return "fnv1a-" + h.toString(16).padStart(8, "0");
}
