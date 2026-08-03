// Row typing for the Academy server functions.
//
// These modules used `Record<string, any>` for every PostgREST row, which meant
// a misread column name was invisible until runtime. `RpcRow` makes the values
// `unknown`, so each one has to be coerced deliberately — which is what the
// mappers were doing anyway, just without the compiler checking.
//
// The Supabase CLIENT is still `any`, matching the convention in
// v31-public.functions.ts. The generated Database type does not describe
// SECURITY DEFINER RPCs, so a narrower type would be a fiction that has to be
// cast away at every call site. One documented exception is better than a type
// nobody can satisfy honestly.

/** A row as PostgREST returns it: string keys, values of unknown shape. */
export type RpcRow = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see header:
// the generated Database type does not cover SECURITY DEFINER RPCs.
export type Ctx = { supabase: any; userId: string };
