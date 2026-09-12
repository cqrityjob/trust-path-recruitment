// Security Passport — reading an object the generated types have not met yet.
//
// ── THE PROBLEM, AND WHY IT IS NOT A MISTAKE ───────────────────────────
//
// `src/integrations/supabase/types.ts` is generated from the HOSTED database.
// This repository ships migrations ahead of their application on purpose —
// that is the schema-first contract, enforced by
// `scripts/schema-first-release-check.ts` — so between a migration being
// written and being applied, the generated types describe a schema that is
// deliberately one step behind the branch.
//
// The compiler reports that honestly:
//
//     Property 'code' does not exist on type
//     SelectQueryError<"column 'scope_code' does not exist on
//     'sp_credential_types'.">
//
// It is right. Regenerating the types against a database that has not run the
// migration would make types.ts assert something untrue about production,
// which is the exact class of claim the release-state bookkeeping exists to
// keep honest. So the types stay accurate and the READ says, in one auditable
// place, that it is reaching past them.
//
// ── WHY ONE NAMED FUNCTION AND NOT A CAST PER CALL SITE ────────────────
//
// `orNull` in ./rpc.ts establishes the doctrine for this repository, in its
// own words: a scattering of `as unknown as` casts would each be
// indistinguishable from a genuine type error somebody silenced, whereas one
// named function is auditable. `grep fromPendingSchema` finds every place a
// read is ahead of the generated schema, and nothing else is loosened — the
// ROW type is still checked, so a misspelled column or a wrong value type is
// still a compile error.
//
// ── THIS IS TEMPORARY, AND HERE IS ITS REMOVAL CONDITION ───────────────
//
// Every call must be deleted, and this module with them, once
// 20261110090000_sp_global_professional_certifications is applied on the owner
// project and `types.ts` is regenerated. `market-access.ts` records the
// previous occurrence of exactly this: "the TYPE-level escape hatch that lived
// below this file was removed with them". The same is owed here.
//
// ── IT DOES NOT MAKE THE READ SAFE ─────────────────────────────────────
//
// A cast silences the compiler and changes nothing about the database. A
// SELECT naming a column PostgREST has never heard of fails the WHOLE request
// — which is how the Passport once went dark for holders whose records were
// entirely intact. So every caller of this pairs it with `isMissingColumn` or
// `isMissingRelation` from ./market-access and an honest degraded answer.
// The cast is the compiler's half; the fallback is the holder's.

/** A Supabase error, as much of it as the fallbacks need. */
export interface PendingSchemaError {
  readonly code?: string;
  readonly message: string;
}

export interface PendingSchemaResult<Row> {
  readonly data: Row[] | null;
  readonly error: PendingSchemaError | null;
}

/** The subset of the PostgREST query builder these reads use. Deliberately
 *  small: a wider surface would invite this escape hatch to spread beyond the
 *  reads that actually need it. */
export interface PendingSchemaQuery<Row> extends PromiseLike<PendingSchemaResult<Row>> {
  eq(column: string, value: string | number | boolean): PendingSchemaQuery<Row>;
  is(column: string, value: null): PendingSchemaQuery<Row>;
  order(column: string, options: { ascending: boolean }): PendingSchemaQuery<Row>;
}

export interface PendingSchemaTable<Row> {
  select(columns: string): PendingSchemaQuery<Row>;
}

/**
 * Read a relation the generated types do not describe yet.
 *
 * `Row` is supplied by the caller and IS checked, so this widens exactly one
 * thing — whether the generated schema has heard of the relation and its
 * columns — and nothing else.
 */
export function fromPendingSchema<Row>(client: unknown, relation: string): PendingSchemaTable<Row> {
  return (client as { from: (r: string) => PendingSchemaTable<Row> }).from(relation);
}
