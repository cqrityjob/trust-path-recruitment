// Synthetic payloads for the unit tests, the guard and the stubbed e2e spec.
// Every value is invented: "SYNTHETIC" operators, fixed fake ids, no real
// person, document or legal assessment.

import type { SelfDeclarationsPayload } from "../model";

const AUTH_ENFORCEMENT = "0a000000-0000-4000-8000-000000000001";
const AUTH_REMARKS = "0a000000-0000-4000-8000-000000000002";
const AUTH_CRIMINAL = "0a000000-0000-4000-8000-000000000003";
export const SYNTHETIC_DECLARATION_ID = "0d000000-0000-4000-8000-000000000001";
export const SYNTHETIC_DOCUMENT_ID = "0f000000-0000-4000-8000-000000000001";
const HOLDER = "00000000-0000-4000-8000-000000000001";

function authorization(
  id: string,
  kind: SelfDeclarationsPayload["authorizations"][number]["kind"],
  statementVersion: string,
  storesDocuments: boolean,
): SelfDeclarationsPayload["authorizations"][number] {
  return {
    id,
    kind,
    jurisdiction: "SE",
    statementVersion,
    operatorName: "SYNTHETIC Operator AB",
    operatorRegistration: "SYNTHETIC-000000-0000",
    purpose: "SYNTHETIC fixture purpose. Not a real processing record.",
    legalBasis: kind === "criminal_history" ? "legal_obligation" : "consent",
    legalBasisDetail: "SYNTHETIC fixture basis. Not a legal assessment.",
    statementPeriod: kind === "criminal_history" ? "SYNTHETIC last five years" : null,
    retentionDays: 180,
    permittedOperations: storesDocuments
      ? ["collect_declaration", "store_document"]
      : ["collect_declaration"],
    permittedDocumentTypes: !storesDocuments
      ? []
      : kind === "enforcement_debt_none"
        ? ["enforcement_authority_statement"]
        : kind === "payment_remarks_none"
          ? ["credit_report"]
          : ["police_extract"],
  };
}

/** What a fresh installation returns: nothing is authorized. */
export const CLOSED_PAYLOAD: SelfDeclarationsPayload = { authorizations: [], declarations: [] };

/** Both financial kinds open; enforcement may store a document. */
export const OPEN_PAYLOAD: SelfDeclarationsPayload = {
  authorizations: [
    authorization(AUTH_ENFORCEMENT, "enforcement_debt_none", "se-enforcement-v1", true),
    authorization(AUTH_REMARKS, "payment_remarks_none", "se-remarks-v1", false),
  ],
  declarations: [],
};

/** A criminal-history authorization exists in the database. The app must still stay closed. */
export const CRIMINAL_AUTHORIZED_PAYLOAD: SelfDeclarationsPayload = {
  authorizations: [
    authorization(AUTH_CRIMINAL, "criminal_history", "se-criminal-synthetic-v1", true),
  ],
  declarations: [],
};

type Declaration = SelfDeclarationsPayload["declarations"][number];

export function syntheticDocument(
  overrides: Partial<NonNullable<Declaration["document"]>> = {},
): NonNullable<Declaration["document"]> {
  return {
    id: SYNTHETIC_DOCUMENT_ID,
    documentType: "enforcement_authority_statement",
    jurisdiction: "SE",
    issueDate: "2026-11-08",
    fileName: "SYNTHETIC-fixture.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    status: "attached",
    declarationRevision: 1,
    storagePath: `${HOLDER}/${SYNTHETIC_DOCUMENT_ID}.pdf`,
    reviewRequestedAt: null,
    createdAt: "2026-11-11T10:00:00Z",
    review: null,
    ...overrides,
  };
}

export function syntheticDeclaration(overrides: Partial<Declaration> = {}): Declaration {
  return {
    id: SYNTHETIC_DECLARATION_ID,
    kind: "enforcement_debt_none",
    jurisdiction: "SE",
    statementVersion: "se-enforcement-v1",
    asOfDate: "2026-11-11",
    declaredAt: "2026-11-11T10:00:00Z",
    revision: 1,
    status: "active",
    withdrawnAt: null,
    retainUntil: "2027-05-10T10:00:00Z",
    authorizationId: AUTH_ENFORCEMENT,
    provenance: "self_declared",
    document: null,
    pendingUpload: null,
    erasures: [],
    reviewAvailable: false,
    ...overrides,
  };
}

export function withDeclarations(...declarations: Declaration[]): SelfDeclarationsPayload {
  return { ...OPEN_PAYLOAD, declarations };
}
