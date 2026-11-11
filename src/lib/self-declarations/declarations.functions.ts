// Voluntary self-declarations — the server functions the Profile calls.
//
// ── WHO DECIDES ─────────────────────────────────────────────────────────
//
// The database does. Every function here is a thin, authenticated call into
// one of the vsd_ functions (20270324090000), made with the CALLER'S OWN
// client, so ownership, the live session, the processing authorization and
// the revision are all checked there -- and are checked identically for a
// request that never came from this screen. Nothing here grants anything.
//
// The service key is used in exactly two server-only files, never here at
// module level: erasing the caller's own queued files (erasure.server.ts) and
// reading the bucket for the server itself (document-store.server.ts) --
// because the bucket has no client SELECT, UPDATE or DELETE at all. Neither
// takes a path or an id from the request: paths come from the database, in
// the same request, after it has authorized the caller's own session.
//
// ── HOW A DOCUMENT IS OPENED ────────────────────────────────────────────
//
// There is no link. Storage cannot serve or sign these objects for any
// client. readSelfDeclarationDocument asks the database -- with the caller's
// session, on EVERY request -- whether this caller may read this document
// right now (live session, ownership or reviewer appointment, current
// authorization, the statement's status, revision and retention, the
// document's status), and only then reads the bytes and returns them,
// uncacheable. So withdrawing, deleting, revoking an authorization, a passed
// retention date, a sign-out or the end of a reviewer's appointment refuses
// the very next request, whether or not the file has been erased yet. Bytes
// already delivered cannot be recalled.
//
// ── WHAT IS NEVER SENT TO THE BROWSER ───────────────────────────────────
//
// The storage path and the file hash.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────
//
// Self-declaration is not verification. No function here returns, computes
// or stores a score, a rank, a risk level or a decision, and none feeds the
// Passport, the CV, an application, talent search or any shared payload.

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DECLARATION_KINDS,
  DOCUMENT_ALLOWED_MIME,
  DOCUMENT_TYPES,
  SELF_DECLARATION_JURISDICTION,
  STATEMENT_VERSIONS,
  buildSelfDeclarationsView,
  documentPayloadSchema,
  safeDocumentName,
  selfDeclarationsPayloadSchema,
  type SelfDeclarationsPayload,
  type SelfDeclarationsView,
} from "./model";
import { DOCUMENT_MAX_ENCODED_LENGTH, validateEncodedDocument } from "./content";
import {
  endAccessAndErase,
  filesOwed,
  uploadDeclarationDocument,
  type UploadStatus,
} from "./workflow";

const BUCKET = "self-declaration-documents";

// The generated Database types do not describe the vsd_ functions, so the
// caller's client is seen through exactly the three calls this module makes.
// Every result is validated with zod before it is used.
type RpcResult = { data: unknown; error: { message: string } | null };
type CallerClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};
type Ctx = { supabase: CallerClient; userId: string };

function ctxOf(context: unknown): Ctx {
  const { supabase, userId } = context as { supabase: unknown; userId: string };
  return { supabase: supabase as CallerClient, userId };
}

/** The database's own refusal code, or a generic one. Never a raw message. */
function refusal(error: { message: string } | null, fallback: string): Error {
  const match = /VSD_[A-Z_]+/.exec(error?.message ?? "");
  return new Error(match ? match[0] : fallback);
}

async function call(ctx: Ctx, fn: string, args: Record<string, unknown>, fallback: string) {
  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (error) throw refusal(error, fallback);
  return data;
}

async function readPayload(ctx: Ctx): Promise<SelfDeclarationsPayload> {
  const { data, error } = await ctx.supabase.rpc("vsd_my_declarations");
  if (error) throw refusal(error, "VSD_READ_FAILED");
  const parsed = selfDeclarationsPayloadSchema.safeParse(data);
  if (!parsed.success) throw new Error("VSD_READ_FAILED");
  return parsed.data;
}

/**
 * Erasing bytes must never hold up the answer to an access decision that has
 * already been made. If Storage does not answer within this budget the
 * request goes on: the file stays queued, is shown as owed, and can be
 * retried. The abandoned attempt records its own outcome on the queue row.
 */
const DRAIN_BUDGET_MS = 8_000;

async function drain(ctx: Ctx): Promise<void> {
  const { drainOwnSelfDeclarationErasures } = await import("./erasure.server");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("VSD_STORAGE_UNAVAILABLE")), DRAIN_BUDGET_MS);
  });
  const attempt = drainOwnSelfDeclarationErasures(ctx.userId);
  // If the budget wins, the attempt is left to finish or fail on its own.
  attempt.catch(() => undefined);
  try {
    await Promise.race([attempt, budget]);
  } finally {
    clearTimeout(timer);
  }
}

export type SelfDeclarationsResult = {
  readonly view: SelfDeclarationsView;
  /** "pending" while a file is still owed to erasure. Never "confirmed" early. */
  readonly fileDeletion: "confirmed" | "pending";
};

function resultOf(payload: SelfDeclarationsPayload): SelfDeclarationsResult {
  return {
    view: buildSelfDeclarationsView(payload),
    fileDeletion: filesOwed(payload) === 0 ? "confirmed" : "pending",
  };
}

// ── Read ────────────────────────────────────────────────────────────────

export const getMySelfDeclarations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SelfDeclarationsResult> => {
    return resultOf(await readPayload(ctxOf(context)));
  });

// ── Save, change, renew ─────────────────────────────────────────────────

const saveInput = z
  .object({
    kind: z.enum(DECLARATION_KINDS),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // The holder's own affirmation. There is no way to send "false" and have
    // it stored, and no default: the screen never pre-ticks it.
    affirmed: z.literal(true),
    /** null to declare for the first time; the revision on screen to change or renew. */
    expectedRevision: z.number().int().positive().nullable(),
  })
  .strict();

export const saveSelfDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => saveInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    // No wording held here means nothing to affirm, whatever the database says.
    const statementVersion = STATEMENT_VERSIONS[data.kind];
    if (!statementVersion) throw new Error("VSD_PROCESSING_NOT_AUTHORIZED");
    const outcome = await endAccessAndErase({
      end: async () => {
        await call(
          ctx,
          "vsd_save_declaration",
          {
            _kind: data.kind,
            _jurisdiction: SELF_DECLARATION_JURISDICTION,
            _statement_version: statementVersion,
            _as_of_date: data.asOfDate,
            _affirmed: data.affirmed,
            _expected_revision: data.expectedRevision,
          },
          "VSD_WRITE_FAILED",
        );
      },
      // A change or renewal sends the previous revision's document to erasure.
      drain: () => (data.expectedRevision === null ? Promise.resolve() : drain(ctx)),
      reload: () => readPayload(ctx),
    });
    return resultOf(outcome.payload);
  });

// ── Withdraw and delete ─────────────────────────────────────────────────

const idInput = z.object({ declarationId: z.string().uuid() }).strict();

export const withdrawSelfDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    const outcome = await endAccessAndErase({
      end: async () => {
        await call(
          ctx,
          "vsd_withdraw_declaration",
          { _id: data.declarationId },
          "VSD_WRITE_FAILED",
        );
      },
      drain: () => drain(ctx),
      reload: () => readPayload(ctx),
    });
    return resultOf(outcome.payload);
  });

export const deleteSelfDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    const outcome = await endAccessAndErase({
      end: async () => {
        await call(ctx, "vsd_delete_declaration", { _id: data.declarationId }, "VSD_WRITE_FAILED");
      },
      drain: () => drain(ctx),
      reload: () => readPayload(ctx),
    });
    return resultOf(outcome.payload);
  });

/** Try the owed cleanup again. Reports only what the database then confirms. */
export const retrySelfDeclarationCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    const outcome = await endAccessAndErase({
      // Reading first lets the database queue again anything that survived.
      end: async () => {
        await readPayload(ctx);
      },
      drain: () => drain(ctx),
      reload: () => readPayload(ctx),
    });
    return resultOf(outcome.payload);
  });

// ── Documents ───────────────────────────────────────────────────────────

const uploadInput = z
  .object({
    /** Chosen by the browser so a lost response can be retried as the same upload. */
    uploadId: z.string().uuid(),
    declarationId: z.string().uuid(),
    declarationRevision: z.number().int().positive(),
    documentType: z.enum(DOCUMENT_TYPES),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fileName: z.string().min(1).max(300),
    mimeType: z.enum(DOCUMENT_ALLOWED_MIME),
    /** base64, without a data: prefix. Bounded here, BEFORE anything decodes it. */
    contentBase64: z.string().min(1).max(DOCUMENT_MAX_ENCODED_LENGTH),
  })
  .strict();

const UPLOAD_STATUSES: readonly UploadStatus[] = [
  "absent",
  "prepared",
  "attached",
  "erasure_pending",
];
function uploadStatus(value: unknown): UploadStatus {
  const status = (value as { status?: unknown } | null)?.status;
  if (typeof status !== "string" || !(UPLOAD_STATUSES as readonly string[]).includes(status)) {
    throw new Error("VSD_UPLOAD_UNCONFIRMED");
  }
  return status as UploadStatus;
}

export const uploadSelfDeclarationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => uploadInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    // Strict base64, decoded size, and the file's REAL type against the
    // declared one. Nothing is recorded or stored for a file that fails.
    const content = validateEncodedDocument(data.contentBase64, data.mimeType);
    if (!content.ok) throw new Error("VSD_FILE_REJECTED");
    const bytes = content.bytes;
    const { createHash } = await import("node:crypto");
    const expected = {
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mimeType: data.mimeType,
    };
    const store = await import("./document-store.server");

    const outcome = await uploadDeclarationDocument({
      begin: async () => {
        // Idempotent on the upload id: a retry finds the same row, in
        // whatever state it reached, and a different file under the same id
        // is refused by the database.
        const row = await call(
          ctx,
          "vsd_begin_document",
          {
            _id: data.uploadId,
            _declaration_id: data.declarationId,
            _declaration_revision: data.declarationRevision,
            _document_type: data.documentType,
            _issue_date: data.issueDate,
            _file_name: safeDocumentName(data.fileName),
            _mime_type: data.mimeType,
            _size_bytes: expected.sizeBytes,
            _sha256: expected.sha256,
          },
          "VSD_UPLOAD_UNCONFIRMED",
        );
        const parsed = documentPayloadSchema.safeParse(row);
        // The path is the database's, and must be inside the caller's folder.
        if (!parsed.success || !parsed.data.storagePath.startsWith(`${ctx.userId}/`)) {
          throw new Error("VSD_UPLOAD_UNCONFIRMED");
        }
        return { status: parsed.data.status, storagePath: parsed.data.storagePath };
      },
      // The object's actual bytes, read back by the server.
      inspect: (storagePath) => store.inspectStoredDocument(storagePath, expected),
      put: async (storagePath) => {
        // The caller's own client: the database's upload policy decides.
        const { error } = await ctx.supabase.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType: data.mimeType, upsert: false });
        if (error) throw new Error("VSD_UPLOAD_UNCONFIRMED");
      },
      stamp: () =>
        store.stampDocumentContent({
          documentId: data.uploadId,
          holderUserId: ctx.userId,
          expected,
        }),
      attach: async () => {
        await call(ctx, "vsd_attach_document", { _id: data.uploadId }, "VSD_UPLOAD_UNCONFIRMED");
      },
      state: async () =>
        uploadStatus(
          await call(ctx, "vsd_upload_state", { _id: data.uploadId }, "VSD_UPLOAD_UNCONFIRMED"),
        ),
      // Acts on an unfinished upload only; the database ignores it otherwise.
      abandon: async () => {
        await call(ctx, "vsd_abandon_upload", { _id: data.uploadId }, "VSD_UPLOAD_UNCONFIRMED");
      },
    });

    // Attaching replaces a previous document and abandoning queues this one,
    // so something may now be owed to erasure.
    try {
      await drain(ctx);
    } catch {
      // Still owed; the reload says so.
    }
    if (outcome.status === "failed") throw new Error(outcome.code);
    if (outcome.status === "unconfirmed") throw new Error("VSD_UPLOAD_UNCONFIRMED");
    return resultOf(await readPayload(ctx));
  });

const documentInput = z.object({ documentId: z.string().uuid() }).strict();

/** Remove a document, or an upload that never finished. */
export const removeSelfDeclarationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => documentInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    const outcome = await endAccessAndErase({
      end: async () => {
        await call(ctx, "vsd_discard_document", { _id: data.documentId }, "VSD_WRITE_FAILED");
      },
      drain: () => drain(ctx),
      reload: () => readPayload(ctx),
    });
    return resultOf(outcome.payload);
  });

const authorizedRead = z.object({
  documentId: z.string().uuid(),
  as: z.enum(["holder", "reviewer"]),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.enum(DOCUMENT_ALLOWED_MIME),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type SelfDeclarationDocumentContent = {
  readonly fileName: string;
  readonly mimeType: (typeof DOCUMENT_ALLOWED_MIME)[number];
  readonly contentBase64: string;
};

/**
 * One document's bytes, for one request.
 *
 * Authorization is asked of the database every time, with the caller's own
 * session, immediately before the bytes are read -- there is no link, token
 * or cached decision to outlive a withdrawal, a revocation, a passed
 * retention date, a sign-out or the end of a reviewer's appointment. The
 * response must not be stored by any cache.
 */
export const readSelfDeclarationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => documentInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationDocumentContent> => {
    const ctx = ctxOf(context);
    setResponseHeader("Cache-Control", "no-store, private, max-age=0");
    setResponseHeader("Pragma", "no-cache");
    setResponseHeader("X-Content-Type-Options", "nosniff");
    const { data: granted, error } = await ctx.supabase.rpc("vsd_authorize_document_read", {
      _id: data.documentId,
    });
    if (error) throw refusal(error, "VSD_DOCUMENT_NOT_FOUND");
    const parsed = authorizedRead.safeParse(granted);
    if (!parsed.success || parsed.data.documentId !== data.documentId) {
      throw new Error("VSD_DOCUMENT_NOT_FOUND");
    }
    const { readAuthorizedDocument } = await import("./document-store.server");
    const bytes = await readAuthorizedDocument(parsed.data.storagePath, {
      sizeBytes: parsed.data.sizeBytes,
      sha256: parsed.data.sha256,
      mimeType: parsed.data.mimeType,
    });
    return {
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      contentBase64: Buffer.from(bytes).toString("base64"),
    };
  });

const reviewInput = z.object({ documentId: z.string().uuid(), requested: z.boolean() }).strict();

/** Ask for, or take back, a human review of one document. */
export const setSelfDeclarationReviewRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => reviewInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    await call(
      ctx,
      "vsd_set_document_review_request",
      { _id: data.documentId, _requested: data.requested },
      "VSD_WRITE_FAILED",
    );
    return resultOf(await readPayload(ctx));
  });
