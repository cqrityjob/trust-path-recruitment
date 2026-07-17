// Public barrel for the Career Intelligence Graph.
// UI code should import from here, never from raw seed files.

export * from "./graph-meta";
export * from "./types";
export * from "./read";
export * from "./gap-engine";
export {
  formalRequirements,
  professionFormalRequirements,
  getFormalRequirement,
  getFormalRequirementsForProfession,
} from "./formal-requirements";

// Kick dev integrity checks (no-op in prod).
import "./integrity";
