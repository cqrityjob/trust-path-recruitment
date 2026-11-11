// Voluntary self-declarations — the model of the Security Passport bridge.
//
// The bridge (20270325090000) is the one way a statement leaves the Profile:
//
//   * the holder's own Passport page shows their CURRENT statements as
//     self-declared shields;
//   * the holder may attach chosen statements to one Passport link;
//   * a signed-in recipient of that link may read exactly those statements.
//
// This module is pure (no I/O). It validates what the database returns and
// NARROWS it, and it applies the application's own lock a second time: a
// statement is shown only when this application holds the exact wording its
// version names (STATEMENT_VERSIONS). So criminal history, for which no
// wording exists here, produces no shield and no recipient row whatever the
// database returns.
//
// What can be shown is exactly `DisclosedStatement`: subject, jurisdiction,
// wording version, the date the statement is about, the day it was made, and
// a reviewed period. There is no field here for a document, a review, a
// score, a verdict or an identity number, and `.strict()` refuses a payload
// that carries one.
//
// Nothing here is a credential. Nothing here is counted, ranked or added to
// Passport completeness, numbering or any export.

import { z } from "zod";
import {
  DECLARATION_KINDS,
  PROVENANCE_LEVELS,
  SELF_DECLARATION_JURISDICTION,
  STATEMENT_VERSIONS,
  type DeclarationKind,
  type Provenance,
} from "./model";

/** The only audience that exists. There is deliberately no anonymous one. */
export const DISCLOSURE_AUDIENCE = "signed_in_recipient";
/** One per kind at most. */
export const MAX_DISCLOSED_STATEMENTS = DECLARATION_KINDS.length;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const disclosedStatementSchema = z
  .object({
    kind: z.enum(DECLARATION_KINDS),
    jurisdiction: z.string().regex(/^[A-Z]{2}$/),
    statementVersion: z.string().min(1).max(64),
    asOfDate: isoDate,
    declaredOn: isoDate,
    statementPeriod: z.string().max(200).nullable(),
  })
  .strict();

/** Everything a recipient, a preview or the holder's shield can show. */
export type DisclosedStatement = {
  readonly kind: DeclarationKind;
  readonly jurisdiction: string;
  readonly statementVersion: string;
  readonly asOfDate: string;
  readonly declaredOn: string;
  readonly statementPeriod: string | null;
};

/** The application's own lock: only wording this application holds. */
export function isHeldStatement(statement: {
  readonly kind: DeclarationKind;
  readonly statementVersion: string;
}): boolean {
  const held = STATEMENT_VERSIONS[statement.kind];
  return held !== undefined && held === statement.statementVersion;
}

const disclosedPayloadSchema = z
  .object({
    audience: z.literal(DISCLOSURE_AUDIENCE).optional(),
    items: z.array(disclosedStatementSchema).max(MAX_DISCLOSED_STATEMENTS),
  })
  .strict();

/**
 * What a preview or a recipient read returned, narrowed. Anything that is not
 * exactly the expected shape yields NOTHING rather than a partial row: an
 * unexpected payload is never rendered.
 */
export function toDisclosedStatements(payload: unknown): readonly DisclosedStatement[] {
  const parsed = disclosedPayloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.items.filter(isHeldStatement);
}

// ── The holder's own Passport ────────────────────────────────────────────

const passportPayloadSchema = z
  .object({
    open: z.array(
      z
        .object({
          kind: z.enum(DECLARATION_KINDS),
          jurisdiction: z.string().regex(/^[A-Z]{2}$/),
          statementVersion: z.string().min(1),
        })
        .strict(),
    ),
    declarations: z.array(
      z
        .object({
          id: z.string().uuid(),
          revision: z.number().int().positive(),
          statement: disclosedStatementSchema,
          provenance: z.enum(PROVENANCE_LEVELS),
          shareable: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export type PassportDeclarationsPayload = z.infer<typeof passportPayloadSchema>;

export function parsePassportDeclarations(payload: unknown): PassportDeclarationsPayload | null {
  const parsed = passportPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export type PassportDeclaration = {
  readonly id: string;
  /** The revision on screen. A selection names it, so a stale screen is refused. */
  readonly revision: number;
  readonly statement: DisclosedStatement;
  /** Shown to the holder only, as a description. Never changes the shield. */
  readonly provenance: Provenance;
  /** A current disclosure authorization exists for this statement. */
  readonly shareable: boolean;
};

export type PassportDeclarationsView = {
  /**
   * not_activated  nothing can be declared: the page says so, neutrally
   * none           declaring is open and the holder has declared nothing
   * declared       at least one current statement
   *
   * There is no state for "withdrawn", "expired" or "missing": an absent
   * statement is simply absent, and nothing adverse is ever inferred.
   */
  readonly state: "not_activated" | "none" | "declared";
  readonly declarations: readonly PassportDeclaration[];
};

export function buildPassportDeclarationsView(
  payload: PassportDeclarationsPayload,
  jurisdiction: string = SELF_DECLARATION_JURISDICTION,
): PassportDeclarationsView {
  const declarations = payload.declarations
    .filter((d) => d.statement.jurisdiction === jurisdiction && isHeldStatement(d.statement))
    .map(
      (d): PassportDeclaration => ({
        id: d.id,
        revision: d.revision,
        statement: d.statement,
        provenance: d.provenance,
        shareable: d.shareable,
      }),
    );
  const activated = payload.open.some((o) => o.jurisdiction === jurisdiction && isHeldStatement(o));
  return {
    state: declarations.length > 0 ? "declared" : activated ? "none" : "not_activated",
    declarations,
  };
}

/** What the page shows when the read fails or is refused: the closed state. */
export const CLOSED_PASSPORT_DECLARATIONS: PassportDeclarationsView = {
  state: "not_activated",
  declarations: [],
};

// ── Selection ────────────────────────────────────────────────────────────

/** One explicit choice: this statement, at this revision. */
export type DisclosureChoice = { readonly declarationId: string; readonly revision: number };

export const disclosureChoicesSchema = z
  .array(
    z.object({ declarationId: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  )
  .min(1)
  .max(MAX_DISCLOSED_STATEMENTS);

/**
 * The choices that may be attached: those the holder ticked AND that the
 * server's preview actually returned. A statement the holder has not been
 * shown, as a recipient will see it, is never attached.
 */
export function confirmedChoices(
  ticked: readonly PassportDeclaration[],
  previewed: readonly DisclosedStatement[],
): readonly DisclosureChoice[] {
  return ticked
    .filter((d) =>
      previewed.some(
        (p) =>
          p.kind === d.statement.kind &&
          p.jurisdiction === d.statement.jurisdiction &&
          p.statementVersion === d.statement.statementVersion &&
          p.asOfDate === d.statement.asOfDate,
      ),
    )
    .map((d) => ({ declarationId: d.id, revision: d.revision }));
}

const selectionRowSchema = z
  .object({
    id: z.string().uuid(),
    disclosureId: z.string().uuid(),
    kind: z.enum(DECLARATION_KINDS),
    jurisdiction: z.string().regex(/^[A-Z]{2}$/),
    statementVersion: z.string().min(1),
    createdAt: z.string(),
    withdrawnAt: z.string().nullable(),
    disclosable: z.boolean(),
    accessCount: z.number().int().nonnegative(),
    lastAccessedAt: z.string().nullable(),
  })
  .strict();

/** One statement on one link, as its holder sees it. Never who read it. */
export type SharedSelection = {
  readonly id: string;
  readonly disclosureId: string;
  readonly kind: DeclarationKind;
  readonly createdAt: string;
  /** Decided by the database as of this read; false once anything ended it. */
  readonly disclosable: boolean;
  readonly accessCount: number;
};

export function toSharedSelections(payload: unknown): readonly SharedSelection[] {
  const parsed = z.array(selectionRowSchema).safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.filter(isHeldStatement).map((row) => ({
    id: row.id,
    disclosureId: row.disclosureId,
    kind: row.kind,
    createdAt: row.createdAt,
    disclosable: row.disclosable,
    accessCount: row.accessCount,
  }));
}
