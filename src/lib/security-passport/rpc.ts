// Security Passport — one small honesty about the generated RPC types.
//
// ── THE PROBLEM ────────────────────────────────────────────────────────
//
// Supabase's type generator reads a function's SQL signature but has no
// nullability information for its PARAMETERS, so it emits every argument as
// non-nullable:
//
//     sp_attach_evidence: { Args: { _claim_id: string; _period_id: string; … } }
//
// Several Passport functions genuinely take NULL, and branch on it — that is
// how `sp_attach_evidence(claim, NULL, …)` means "attach to a claim" and
// `sp_attach_evidence(NULL, period, …)` means "attach to an employment
// period". Passing NULL is correct; the generated type is imprecise.
//
// ── WHY THIS EXISTS RATHER THAN A CAST AT EVERY CALL SITE ──────────────
//
// Twenty `as unknown as string` casts scattered through the server tier
// would each be indistinguishable from a genuine type error somebody
// silenced. One named function, documented here, is auditable: `grep orNull`
// finds every place the generator's imprecision is being worked around, and
// nothing else in the domain is loosened.
//
// It deliberately does NOT widen the key names or the value types — only
// nullability. Misspelling a parameter or passing a number where the
// function wants text is still a compile error.

/**
 * States that `null` is a legal value for a generated RPC parameter.
 *
 * Use ONLY where the SQL function's own body handles NULL. If a function
 * would fail on NULL, this is the wrong tool and the caller should not be
 * passing one.
 */
export function orNull<T>(value: T | null | undefined): T {
  return value as T;
}
