// The one question a recruiter screen asks about an AI provider mode.
//
// The runtime records which engine produced a run -- the deterministic test
// engine, a development model or the production model -- and that value is
// provenance: it lives in the run record and under the report's audit
// details, and its raw form never reaches a recruiter (a guard reads the
// interview UI module for the internal vocabulary and refuses it).
//
// A recruiter screen still has to know ONE thing, because it changes what the
// screen must say: whether the output in front of them came from the
// rule-based test engine, which produces well-formed Swedish a person cannot
// tell from a model's. That decision is made here, in a module with no
// provider, no credential and no server code behind it, so the interview UI
// can import it without the engine vocabulary following.

import type { ProviderMode } from "./ai/orchestrator";

const TEST_ENGINE: ProviderMode = "synthetic";

/** True when a run's recorded mode names the deterministic test engine. */
export function isTestEngineOutput(mode: string | null | undefined): boolean {
  return mode === TEST_ENGINE;
}
