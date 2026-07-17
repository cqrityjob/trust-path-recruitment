// Central version stamp for the Career Intelligence Graph.
// Bump when published entities/relationships change in a user-visible way.

export const GRAPH_VERSION = "cig-2026.07.1" as const;
export type GraphVersion = typeof GRAPH_VERSION;

// Sprint 09C introduces the DB-backed canonical graph. It is created in
// Phase A but only activated as the primary UI source after Phase E
// verification. Until then, GRAPH_VERSION above continues to reflect the
// TS-seeded legacy graph that is still serving the UI.
export const GRAPH_VERSION_NEXT = "cig-2026.07-09C.1" as const;
export type GraphVersionNext = typeof GRAPH_VERSION_NEXT;
export const GRAPH_ACTIVATION_STATE: "legacy" | "dual" | "next" = "legacy";

export const CIG_LOCALE_DEFAULT = "sv" as const;
