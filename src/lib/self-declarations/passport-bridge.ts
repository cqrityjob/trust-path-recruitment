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

// ── One creation operation ───────────────────────────────────────────────
//
// A link and its choice of statements are created by ONE database call, under
// one request key. The caller can lose the answer to that call without the
// database having lost the work, so "the call failed" is never read as
// "nothing was shared". There are exactly three things a caller can know:
//
//   * CONFIRMED CREATED   the database answered, now or on reconciliation:
//                         the link exists and carries exactly this choice;
//   * CONFIRMED NOT       the database REFUSED (its own named refusal): the
//                         whole transaction rolled back, so no link exists
//                         and nothing is shared -- or a link exists that was
//                         created without a choice and can never gain one;
//   * UNCONFIRMED         anything else. The same operation -- same key, same
//                         share, same choices -- is kept and can be repeated:
//                         the database answers a repeat from what it sealed,
//                         so a retry can neither create a second link nor
//                         widen the choice.

/** A possibly EMPTY choice: an offered-and-declined choice is sealed too. */
export const sealedChoicesSchema = z
  .array(
    z.object({ declarationId: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  )
  .max(MAX_DISCLOSED_STATEMENTS);

/** The credential link being created; the Passport's own share inputs. */
export type ShareOperationLink = {
  readonly claimIds: readonly string[];
  readonly permittedFields: readonly ("holder_name" | "identifier" | "profile_title")[];
  readonly expiresDays: number;
  readonly locale: "sv" | "en";
};

/** Everything a retry needs, kept unchanged until the operation is settled. */
export type ShareOperation = {
  readonly requestKey: string;
  readonly link: ShareOperationLink;
  readonly choices: readonly DisclosureChoice[];
};

const createdShareSchema = z.union([
  z.object({
    status: z.literal("created"),
    token: z.string().min(1),
    disclosure_id: z.string().uuid(),
    expires_at: z.string().nullable().optional(),
    declarations: z.number().int().min(0).max(MAX_DISCLOSED_STATEMENTS),
  }),
  z.object({
    status: z.literal("already_created"),
    disclosure_id: z.string().uuid(),
    expires_at: z.string().nullable().optional(),
    declarations: z.number().int().min(0).max(MAX_DISCLOSED_STATEMENTS),
  }),
]);

/** What vsd_create_credential_share answered. */
export type CreatedShare = {
  /** `already_created`: a repeat of a committed operation; no address again. */
  readonly status: "created" | "already_created";
  readonly token: string | null;
  readonly disclosureId: string;
  readonly expiresAt: string | null;
  /** How many statements the link was SEALED with. */
  readonly declarations: number;
};

export function toCreatedShare(payload: unknown): CreatedShare | null {
  const parsed = createdShareSchema.safeParse(payload);
  if (!parsed.success) return null;
  const row = parsed.data;
  return {
    status: row.status,
    token: row.status === "created" ? row.token : null,
    disclosureId: row.disclosure_id,
    expiresAt: row.expires_at ?? null,
    declarations: row.declarations,
  };
}

const committedOperationSchema = z.union([
  z.object({ status: z.literal("none") }).strict(),
  z.object({
    status: z.enum(["sealed", "unsealed"]),
    disclosure_id: z.string().uuid(),
    declarations: z.number().int().min(0).max(MAX_DISCLOSED_STATEMENTS),
    choice_digest: z.string().optional(),
  }),
]);

/** What the database has COMMITTED for one request key (vsd_share_operation). */
export type CommittedShareOperation =
  | { readonly status: "none" }
  | {
      readonly status: "sealed" | "unsealed";
      readonly disclosureId: string;
      readonly declarations: number;
    };

export function toCommittedShareOperation(payload: unknown): CommittedShareOperation | null {
  const parsed = committedOperationSchema.safeParse(payload);
  if (!parsed.success) return null;
  const row = parsed.data;
  if (row.status === "none") return { status: "none" };
  return { status: row.status, disclosureId: row.disclosure_id, declarations: row.declarations };
}

/**
 * The marker a server function throws when the database itself refused: its
 * own named refusal (VSD_… from this module, SP_… from the Passport). Raised
 * inside the one transaction, so nothing of the operation was committed.
 * Anything else a caller catches -- a lost connection, a timeout, an
 * unreadable answer -- is NOT a refusal and proves nothing.
 */
const REFUSAL = /^(?:VSD|SP)_[A-Z0-9_]+$/;
export function shareRefusalCode(error: unknown): string | null {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  return REFUSAL.test(message) ? message : null;
}

export type ShareOperationOutcome =
  /** Confirmed: the link exists and carries exactly the operation's choice.
   *  `token` is null when the creating answer was lost: the link's address is
   *  shown once by the database and cannot be read again. */
  | {
      readonly kind: "created";
      readonly disclosureId: string;
      readonly token: string | null;
      readonly expiresAt: string | null;
      readonly declarations: number;
    }
  /** Confirmed: the database refused. No link, nothing shared. */
  | { readonly kind: "refused"; readonly code: string }
  /** Confirmed: a link exists under this key, created without a choice. It
   *  carries no statement and never will. */
  | { readonly kind: "created_without"; readonly disclosureId: string }
  /** Not known. The operation is kept; repeating it is safe. */
  | { readonly kind: "unconfirmed" };

export type ShareOperationApi = {
  readonly create: (operation: ShareOperation) => Promise<CreatedShare>;
  readonly committed: (requestKey: string) => Promise<CommittedShareOperation>;
};

/**
 * Run -- or repeat -- one creation operation and say only what is known.
 *
 * Called again with the SAME operation for a retry: the database then either
 * creates what never arrived, answers `already_created` from the seal, or
 * refuses. It is never called with a new key or a changed choice for an
 * operation that is still unconfirmed.
 */
export async function settleShareOperation(
  api: ShareOperationApi,
  operation: ShareOperation,
): Promise<ShareOperationOutcome> {
  let created: CreatedShare;
  try {
    created = await api.create(operation);
  } catch (error) {
    const code = shareRefusalCode(error);
    if (code) return { kind: "refused", code };
    // The answer was lost. Ask what was actually committed.
    let committed: CommittedShareOperation;
    try {
      committed = await api.committed(operation.requestKey);
    } catch {
      return { kind: "unconfirmed" };
    }
    if (committed.status === "sealed" && committed.declarations === operation.choices.length) {
      return {
        kind: "created",
        disclosureId: committed.disclosureId,
        token: null,
        expiresAt: null,
        declarations: committed.declarations,
      };
    }
    if (committed.status === "unsealed") {
      return { kind: "created_without", disclosureId: committed.disclosureId };
    }
    // Nothing committed YET: the lost request may still be in flight, so this
    // is not proof that nothing will be. Only a repeat settles it.
    return { kind: "unconfirmed" };
  }
  // The database seals the choice it was sent; a different count is an answer
  // this screen cannot vouch for.
  if (created.declarations !== operation.choices.length) return { kind: "unconfirmed" };
  return {
    kind: "created",
    disclosureId: created.disclosureId,
    token: created.token,
    expiresAt: created.expiresAt,
    declarations: created.declarations,
  };
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
