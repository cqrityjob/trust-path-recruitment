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
// The one place the service key is used is erasing the caller's own queued
// files (erasure.server.ts), because the bucket has no client DELETE at all.
// It takes no path and no id from the request.
//
// ── WHAT IS NEVER SENT TO THE BROWSER ───────────────────────────────────
//
// The storage path and the file hash. A document is opened through a
// five-minute signed URL that Storage issues only while the database says
// the document is live and the caller may read it.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────
//
// Self-declaration is not verification. No function here returns, computes
// or stores a score, a rank, a risk level or a decision, and none feeds the
// Passport, the CV, an application, talent search or any shared payload.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DECLARATION_KINDS,
  DOCUMENT_ALLOWED_MIME,
  DOCUMENT_MAX_BYTES,
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
import { endAccessAndErase, filesOwed, uploadDeclarationDocument } from "./workflow";

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
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
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

async function drain(ctx: Ctx): Promise<void> {
  const { drainOwnSelfDeclarationErasures } = await import("./erasure.server");
  await drainOwnSelfDeclarationErasures(ctx.userId);
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

/** Find the caller's own live document; the path stays on the server. */
function ownDocument(payload: SelfDeclarationsPayload, documentId: string) {
  for (const d of payload.declarations) {
    if (d.document?.id === documentId) return { declaration: d, document: d.document };
  }
  return null;
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
    /** base64, without a data: prefix. */
    contentBase64: z.string().min(1),
  })
  .strict();

export const uploadSelfDeclarationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => uploadInput.parse(data))
  .handler(async ({ context, data }): Promise<SelfDeclarationsResult> => {
    const ctx = ctxOf(context);
    const bytes = Buffer.from(data.contentBase64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > DOCUMENT_MAX_BYTES) {
      throw new Error("VSD_FILE_REJECTED");
    }
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const outcome = await uploadDeclarationDocument({
      begin: async () => {
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
            _size_bytes: bytes.byteLength,
            _sha256: sha256,
          },
          "VSD_UPLOAD_FAILED",
        );
        const parsed = documentPayloadSchema.safeParse(row);
        // The path is the database's, and must be inside the caller's folder.
        if (!parsed.success || !parsed.data.storagePath.startsWith(`${ctx.userId}/`)) {
          throw new Error("VSD_UPLOAD_FAILED");
        }
        return { storagePath: parsed.data.storagePath };
      },
      put: async (storagePath) => {
        const { error } = await ctx.supabase.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType: data.mimeType, upsert: false });
        return { ok: error === null };
      },
      attach: async () => {
        await call(ctx, "vsd_attach_document", { _id: data.uploadId }, "VSD_UPLOAD_FAILED");
      },
      discard: async () => {
        await call(ctx, "vsd_discard_document", { _id: data.uploadId }, "VSD_UPLOAD_FAILED");
      },
    });

    // Attaching replaces a previous document; a failure discards this one.
    // Either way something may now be owed to erasure.
    try {
      await drain(ctx);
    } catch {
      // Still owed; the reload says so.
    }
    if (outcome.status === "failed") throw new Error(outcome.code);
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

/** A five-minute link to the caller's own live document. Storage decides. */
export const getSelfDeclarationDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => documentInput.parse(data))
  .handler(async ({ context, data }): Promise<{ url: string; expiresInSeconds: number }> => {
    const ctx = ctxOf(context);
    const own = ownDocument(await readPayload(ctx), data.documentId);
    if (!own || own.declaration.status !== "active" || own.document.status !== "attached") {
      throw new Error("VSD_DOCUMENT_NOT_FOUND");
    }
    const signed = await ctx.supabase.storage
      .from(BUCKET)
      .createSignedUrl(own.document.storagePath, 300);
    if (signed.error || !signed.data) throw new Error("VSD_DOCUMENT_NOT_FOUND");
    return { url: signed.data.signedUrl, expiresInSeconds: 300 };
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
