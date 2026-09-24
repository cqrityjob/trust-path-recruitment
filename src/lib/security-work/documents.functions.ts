import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireWorkspace } from "./services";
import { analysisResult, AnalysisFailure, checked } from "./analysis-services";

const scope = z.object({ workspaceId: z.string().uuid() }).strict();
export const getWorkEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(scope)
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId);
      const [facts, segments, documents] = await Promise.all([
        context.supabase
          .from("sw_source_items")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .order("created_at", { ascending: false })
          .limit(501),
        context.supabase
          .from("sw_extraction_segments")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .limit(501),
        context.supabase
          .from("sw_documents")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .order("created_at", { ascending: false })
          .limit(501),
      ]);
      const result = {
        facts: checked(facts) ?? [],
        segments: checked(segments) ?? [],
        documents: checked(documents) ?? [],
      };
      if (Object.values(result).some((rows) => rows.length > 500))
        throw new AnalysisFailure("LIST_LIMIT");
      await requireWorkspace(context, data.workspaceId);
      return result;
    }),
  );
export const uploadWorkDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    scope.extend({
      requestId: z.string().uuid(),
      filename: z.string().min(1).max(255),
      mimeType: z.enum([
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]),
      contentBase64: z
        .string()
        .min(4)
        .max(13981016)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId, true);
      const { createHash } = await import("node:crypto");
      const bytes = Buffer.from(data.contentBase64, "base64");
      if (
        !bytes.length ||
        bytes.length > 10 * 1024 * 1024 ||
        bytes.toString("base64") !== data.contentBase64
      )
        throw new AnalysisFailure("INVALID_INPUT");
      if (
        data.mimeType === "application/pdf"
          ? bytes.subarray(0, 5).toString() !== "%PDF-"
          : bytes.readUInt32LE(0) !== 0x04034b50
      )
        throw new AnalysisFailure("DOCUMENT_UNSUPPORTED");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const document = checked(
        await context.supabase.rpc("sw_reserve_document", {
          _workspace_id: data.workspaceId,
          _request_id: data.requestId,
          _filename: data.filename,
          _mime_type: data.mimeType,
          _size_bytes: bytes.length,
          _sha256: sha256,
        }),
      );
      if (!document) throw new AnalysisFailure("SAVE_FAILED");
      const storage = context.supabase.storage.from("sw-documents");
      const upload = await storage.upload(document.object_path, bytes, {
        contentType: data.mimeType,
        upsert: false,
      });
      if (upload.error) {
        // A lost acknowledgement can leave the immutable original uploaded. Only
        // accept that existing object if its bytes match this reserved request.
        const original = await storage.download(document.object_path);
        if (
          original.error ||
          !original.data ||
          original.data.size !== bytes.length ||
          createHash("sha256")
            .update(new Uint8Array(await original.data.arrayBuffer()))
            .digest("hex") !== sha256
        )
          throw new AnalysisFailure("SAVE_FAILED");
      }
      await requireWorkspace(context, data.workspaceId, true);
      return document;
    }),
  );
export const extractWorkDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(scope.extend({ documentId: z.string().uuid(), requestId: z.string().uuid() }))
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId, true);
      const { signProcessingReceipt, assertWorkerSigningConfigured } =
        await import("./processing/attestation.server");
      const { extractDocument, extractionProcessorConfiguration } =
        await import("./processing/extract-transport.server");
      try {
        assertWorkerSigningConfigured();
        extractionProcessorConfiguration();
      } catch {
        throw new AnalysisFailure("PROCESSING_NOT_CONFIGURED");
      }
      if (!process.env.SW_WORKER_KEY_ID || !process.env.SW_WORKER_SECRET)
        throw new AnalysisFailure("PROCESSING_NOT_CONFIGURED");
      const document = checked(
        await context.supabase
          .from("sw_documents")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .eq("id", data.documentId)
          .maybeSingle(),
      );
      if (!document) throw new AnalysisFailure("ACCESS_DENIED");
      const job = checked(
        await context.supabase.rpc("sw_reserve_processing", {
          _workspace_id: data.workspaceId,
          _request_id: data.requestId,
          _kind: "extraction",
          _document_id: data.documentId,
        }),
      );
      if (!job) throw new AnalysisFailure("SAVE_FAILED");
      const dispatched = checked(
        await context.supabase.rpc("sw_dispatch_processing", {
          _workspace_id: data.workspaceId,
          _job_id: job.id,
        }),
      ) as { dispatch: boolean; job: { id: string; fence: string; status: string } };
      if (!dispatched.dispatch) return dispatched.job;
      const { ExtractionError } = await import("./processing/contracts");
      let payload: string;
      try {
        const original = await context.supabase.storage
          .from("sw-documents")
          .download(document.object_path);
        if (original.error || !original.data || original.data.size !== document.size_bytes)
          throw new AnalysisFailure("DOCUMENT_MISSING");
        const extraction = await extractDocument({
          bytes: new Uint8Array(await original.data.arrayBuffer()),
          mimeType: document.mime_type,
        });
        if (extraction.sha256 !== document.sha256) throw new AnalysisFailure("DOCUMENT_CHANGED");
        payload = JSON.stringify({
          status: "succeeded",
          sha256: extraction.sha256,
          parserVersion: extraction.extractorVersion,
          segments: extraction.segments.map((segment) => ({
            id: crypto.randomUUID(),
            text: segment.text,
            locator: `${segment.locator.kind} ${segment.locator.number} · ${segment.ordinal}`,
            ...(segment.locator.kind === "page"
              ? { pageNumber: segment.locator.number }
              : { section: String(segment.locator.number) }),
          })),
        });
      } catch (error) {
        payload = JSON.stringify({
          status: "failed",
          errorCode: error instanceof ExtractionError ? error.code : "processing_failed",
        });
      }
      const signature = signProcessingReceipt("extraction", job.id, dispatched.job.fence, payload);
      return checked(
        await context.supabase.rpc("sw_complete_processing", {
          _workspace_id: data.workspaceId,
          _job_id: job.id,
          _fence: dispatched.job.fence,
          _key_id: signature.keyId,
          _payload: payload,
          _signature: signature.signature,
        }),
      );
    }),
  );
