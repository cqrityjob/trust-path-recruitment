// Security Career Discovery v3.0 — public surface.
//
// Phase 1 (this module): the versioned instrument definition, the locked
// context questions, stable adaptive paths, all adaptive content, the
// section mapping, and the persistence contract.
//
// Deliberately NOT here yet, and out of scope for Phase 1:
//   · Security Career DNA computation
//   · Security Career Area ranking
//   · report generation
//   · the candidate UI
//
// Those are Phases 2–3. Until they land, this definition cannot produce a
// report and is not administrable — LIFECYCLE_STATUS is `design`.

export * from "./types";
export * from "./version";
export * from "./axes";
export * from "./context-items";
export * from "./core-items";
export * from "./adaptive-items";
export * from "./sections";
export * from "./session";
