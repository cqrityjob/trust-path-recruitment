// Voluntary self-declarations — the model the Profile reads.
//
// A holder may record their own dated statement. It is SELF-DECLARATION: not
// verification, identity verification, security clearance or approval for
// employment. This module is pure (no I/O) so the rules below can be tested
// without a database:
//
//   * the three kinds are never merged, and each is closed unless the
//     database returns a current processing authorization for it AND this
//     application holds the exact statement wording that authorization names;
//   * there is no criminal-history wording in this application, so that kind
//     stays closed whatever the database says;
//   * provenance is what the database derived, and only three values exist;
//   * nothing here computes a score, a rank, a completeness figure or a
//     decision, and nothing is exported to another surface.
//
// The database payload is validated with zod and then NARROWED: the storage
// path and file hash never reach the browser.

import { z } from "zod";

export const DECLARATION_KINDS = [
  "enforcement_debt_none",
  "payment_remarks_none",
  "criminal_history",
] as const;
export type DeclarationKind = (typeof DECLARATION_KINDS)[number];

export const DOCUMENT_TYPES = [
  "enforcement_authority_statement",
  "credit_report",
  "police_extract",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PROVENANCE_LEVELS = [
  "self_declared",
  "document_provided",
  "document_reviewed",
] as const;
export type Provenance = (typeof PROVENANCE_LEVELS)[number];

/** The one jurisdiction this screen asks about. The schema is not tied to it. */
export const SELF_DECLARATION_JURISDICTION = "SE";

/**
 * The statement wording this application holds, by kind. A panel opens only
 * when the recorded authorization names exactly this version, so a holder can
 * never affirm wording other than the wording that was approved.
 *
 * There is deliberately no entry for criminal_history: no reviewed wording
 * exists, so that panel collects nothing.
 */
export const STATEMENT_VERSIONS: Readonly<Partial<Record<DeclarationKind, string>>> = {
  enforcement_debt_none: "se-enforcement-v1",
  payment_remarks_none: "se-remarks-v1",
};

export const DOCUMENT_ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export type DocumentMime = (typeof DOCUMENT_ALLOWED_MIME)[number];
/** The transport is base64 through a server function, as for Passport evidence. */
export const DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

// ── The database payload ─────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const reviewSchema = z.object({
  outcome: z.enum(["matches_declared_details", "not_confirmed"]),
  reviewedAt: z.string(),
  declarationRevision: z.number().int().positive(),
});

export const documentPayloadSchema = z.object({
  id: z.string().uuid(),
  documentType: z.enum(DOCUMENT_TYPES),
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  issueDate: isoDate,
  fileName: z.string().min(1).max(300),
  mimeType: z.enum(DOCUMENT_ALLOWED_MIME),
  sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["prepared", "attached", "erasure_pending"]),
  declarationRevision: z.number().int().positive(),
  storagePath: z.string().min(1),
  reviewRequestedAt: z.string().nullable(),
  createdAt: z.string(),
  review: reviewSchema.nullable(),
});
export type DocumentPayload = z.infer<typeof documentPayloadSchema>;

const erasureSchema = z.object({
  documentId: z.string().uuid(),
  fileName: z.string(),
  requestedAt: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  failed: z.boolean(),
});

export const declarationPayloadSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(DECLARATION_KINDS),
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  statementVersion: z.string().min(1),
  asOfDate: isoDate,
  declaredAt: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(["active", "withdrawn", "deletion_pending"]),
  withdrawnAt: z.string().nullable(),
  retainUntil: z.string(),
  authorizationId: z.string().uuid(),
  provenance: z.enum(PROVENANCE_LEVELS).nullable(),
  document: documentPayloadSchema.nullable(),
  pendingUpload: documentPayloadSchema.nullable(),
  erasures: z.array(erasureSchema),
  reviewAvailable: z.boolean(),
});
export type DeclarationPayload = z.infer<typeof declarationPayloadSchema>;

const authorizationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(DECLARATION_KINDS),
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  statementVersion: z.string().min(1),
  operatorName: z.string().min(1),
  operatorRegistration: z.string().min(1),
  purpose: z.string().min(1),
  legalBasis: z.enum([
    "consent",
    "contract",
    "legal_obligation",
    "legitimate_interests",
    "public_task",
  ]),
  legalBasisDetail: z.string().min(1),
  statementPeriod: z.string().nullable(),
  retentionDays: z.number().int().positive(),
  permittedOperations: z.array(
    z.enum(["collect_declaration", "store_document", "human_document_review"]),
  ),
  permittedDocumentTypes: z.array(z.enum(DOCUMENT_TYPES)),
});
export type ProcessingAuthorization = z.infer<typeof authorizationSchema>;

export const selfDeclarationsPayloadSchema = z.object({
  authorizations: z.array(authorizationSchema),
  declarations: z.array(declarationPayloadSchema),
});
export type SelfDeclarationsPayload = z.infer<typeof selfDeclarationsPayloadSchema>;

// ── What the browser receives ────────────────────────────────────────────

export type DocumentView = {
  readonly id: string;
  readonly documentType: DocumentType;
  readonly issueDate: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly reviewRequested: boolean;
  /** Only ever "the document matches what was declared about it" or not. */
  readonly reviewOutcome: "matches_declared_details" | "not_confirmed" | null;
};

export type CleanupView = {
  readonly documentId: string;
  readonly fileName: string;
  readonly attempts: number;
  readonly failed: boolean;
};

export type DeclarationView = {
  readonly id: string;
  readonly status: "active" | "withdrawn";
  readonly statementVersion: string;
  readonly asOfDate: string;
  readonly declaredAt: string;
  readonly withdrawnAt: string | null;
  readonly retainUntil: string;
  readonly revision: number;
  readonly provenance: Provenance | null;
  readonly document: DocumentView | null;
  /** An upload that was begun and never finished; offered for removal. */
  readonly unfinishedUploadId: string | null;
  readonly reviewAvailable: boolean;
};

export type PanelView = {
  readonly kind: DeclarationKind;
  /**
   * closed    no authorization, or wording this application does not hold:
   *           nothing is asked and nothing can be stored
   * open      authorized, nothing declared
   * declared  an active statement
   * withdrawn a statement the holder took back
   */
  readonly state: "closed" | "open" | "declared" | "withdrawn";
  readonly authorization: {
    readonly operatorName: string;
    readonly operatorRegistration: string;
    readonly purpose: string;
    readonly legalBasis: ProcessingAuthorization["legalBasis"];
    readonly legalBasisDetail: string;
    readonly retentionDays: number;
    readonly statementVersion: string;
    readonly documentTypes: readonly DocumentType[];
  } | null;
  readonly declaration: DeclarationView | null;
  /** Files owed to erasure for this kind, whichever statement they belonged to. */
  readonly cleanups: readonly CleanupView[];
  /** A statement was deleted and its files are not confirmed gone yet. */
  readonly deletionPending: boolean;
};

export type SelfDeclarationsView = {
  readonly panels: readonly PanelView[];
  /** True while any file anywhere is still owed to erasure. */
  readonly cleanupOwed: boolean;
};

function documentView(doc: DocumentPayload): DocumentView {
  return {
    id: doc.id,
    documentType: doc.documentType,
    issueDate: doc.issueDate,
    fileName: doc.fileName,
    sizeBytes: doc.sizeBytes,
    reviewRequested: doc.reviewRequestedAt !== null,
    reviewOutcome: doc.review?.outcome ?? null,
  };
}

/** A document supports a statement only at the exact revision it names. */
function currentDocument(d: DeclarationPayload): DocumentPayload | null {
  const doc = d.document;
  if (!doc || doc.status !== "attached" || doc.declarationRevision !== d.revision) return null;
  return doc;
}

/**
 * The level shown is never higher than what the payload itself supports. The
 * database already derives it; this refuses to display "reviewed" or
 * "provided" if the document that would justify it is not in the payload.
 */
export function displayedProvenance(d: DeclarationPayload): Provenance | null {
  if (d.status !== "active" || d.provenance === null) return null;
  const doc = currentDocument(d);
  if (!doc) return "self_declared";
  if (
    d.provenance === "document_reviewed" &&
    doc.review?.outcome === "matches_declared_details" &&
    doc.review.declarationRevision === d.revision
  ) {
    return "document_reviewed";
  }
  return "document_provided";
}

export function buildSelfDeclarationsView(
  payload: SelfDeclarationsPayload,
  jurisdiction: string = SELF_DECLARATION_JURISDICTION,
): SelfDeclarationsView {
  const panels = DECLARATION_KINDS.map((kind): PanelView => {
    const mine = payload.declarations.filter(
      (d) => d.kind === kind && d.jurisdiction === jurisdiction,
    );
    const live = mine.find((d) => d.status !== "deletion_pending") ?? null;
    const recorded =
      payload.authorizations.find((a) => a.kind === kind && a.jurisdiction === jurisdiction) ??
      null;
    // Both locks: the recorded authorization, and wording this app holds.
    const known = STATEMENT_VERSIONS[kind];
    const authorization =
      recorded && known !== undefined && recorded.statementVersion === known ? recorded : null;

    const declaration: DeclarationView | null =
      live && (live.status === "active" || live.status === "withdrawn")
        ? {
            id: live.id,
            status: live.status,
            statementVersion: live.statementVersion,
            asOfDate: live.asOfDate,
            declaredAt: live.declaredAt,
            withdrawnAt: live.withdrawnAt,
            retainUntil: live.retainUntil,
            revision: live.revision,
            provenance: displayedProvenance(live),
            document: (() => {
              const doc = currentDocument(live);
              return doc && live.status === "active" ? documentView(doc) : null;
            })(),
            unfinishedUploadId: live.pendingUpload?.id ?? null,
            reviewAvailable: live.reviewAvailable,
          }
        : null;

    const state: PanelView["state"] =
      declaration?.status === "active"
        ? "declared"
        : declaration?.status === "withdrawn"
          ? "withdrawn"
          : authorization
            ? "open"
            : "closed";

    return {
      kind,
      state,
      authorization: authorization
        ? {
            operatorName: authorization.operatorName,
            operatorRegistration: authorization.operatorRegistration,
            purpose: authorization.purpose,
            legalBasis: authorization.legalBasis,
            legalBasisDetail: authorization.legalBasisDetail,
            retentionDays: authorization.retentionDays,
            statementVersion: authorization.statementVersion,
            documentTypes: authorization.permittedOperations.includes("store_document")
              ? authorization.permittedDocumentTypes
              : [],
          }
        : null,
      declaration,
      cleanups: mine.flatMap((d) =>
        d.erasures.map((e) => ({
          documentId: e.documentId,
          fileName: e.fileName,
          attempts: e.attempts,
          failed: e.failed,
        })),
      ),
      deletionPending: mine.some((d) => d.status === "deletion_pending"),
    };
  });
  return { panels, cleanupOwed: panels.some((p) => p.cleanups.length > 0) };
}

// ── Input rules shared by the screen and the server function ─────────────

/** Today in the browser's own calendar, as the date a statement speaks about. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type FileProblem = "type" | "size" | "empty";

export function fileProblem(file: {
  readonly type: string;
  readonly size: number;
}): FileProblem | null {
  if (!(DOCUMENT_ALLOWED_MIME as readonly string[]).includes(file.type)) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > DOCUMENT_MAX_BYTES) return "size";
  return null;
}

/** A holder's filename is shown back to them and never used as a path. */
export function safeDocumentName(name: string): string {
  const cleaned = Array.from(name)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f && ch !== "/" && ch !== "\\";
    })
    .join("")
    .trim();
  return (cleaned || "document").slice(0, 200);
}

/** The refusal codes the database raises, mapped to what the holder is told. */
export const SELF_DECLARATION_ERRORS = [
  "VSD_NOT_AUTHENTICATED",
  "VSD_PROCESSING_NOT_AUTHORIZED",
  "VSD_AFFIRMATION_REQUIRED",
  "VSD_STATEMENT_VERSION_MISMATCH",
  "VSD_INVALID_DATE",
  "VSD_INVALID_INPUT",
  "VSD_DECLARATION_EXISTS",
  "VSD_STALE_REVISION",
  "VSD_DECLARATION_NOT_FOUND",
  "VSD_DOCUMENT_NOT_FOUND",
  "VSD_DOCUMENT_DUPLICATE",
  "VSD_UPLOAD_INTENT_MISMATCH",
  "VSD_OBJECT_NOT_FOUND",
  "VSD_DOCUMENT_ERASURE_FENCED",
  "VSD_REVIEW_UNAVAILABLE",
  "VSD_UPLOAD_FAILED",
  "VSD_UPLOAD_UNCONFIRMED",
  "VSD_CONTENT_MISMATCH",
  "VSD_CONTENT_UNVERIFIED",
  "VSD_FILE_REJECTED",
  "VSD_READ_FAILED",
  "VSD_WRITE_FAILED",
] as const;
export type SelfDeclarationError = (typeof SELF_DECLARATION_ERRORS)[number];

export function selfDeclarationErrorCode(message: unknown): SelfDeclarationError {
  const text = typeof message === "string" ? message : "";
  return SELF_DECLARATION_ERRORS.find((code) => text.includes(code)) ?? "VSD_WRITE_FAILED";
}
