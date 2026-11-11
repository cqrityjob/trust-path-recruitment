// Voluntary self-declarations — the server's own hands on the bucket.
//
// The bucket has no client SELECT, UPDATE or DELETE. So three things need the
// service key, and this file is the only place (with erasure.server.ts) that
// holds it for this module:
//
//   inspectStoredDocument   read an object back and say whether its REAL
//                           bytes are the declared size, SHA-256 and type
//   stampDocumentContent    record that match (vsd_stamp_document_content,
//                           service_role only) so the document may be attached
//   readAuthorizedDocument  deliver bytes the database has JUST authorized
//
// NARROW BY CONSTRUCTION. Every function takes a path that came from the
// database in the same request, re-checks its shape (`<uuid>/<uuid>.<ext>`),
// touches this one bucket and no table, and decides nothing about who may
// see what: authorization is the database's, made with the CALLER'S session
// before any of these is called. None of them is reachable from the browser;
// this file is imported only dynamically, inside server-function handlers.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sniffDocumentMime } from "./content";
import type { DocumentMime } from "./model";

const BUCKET = "self-declaration-documents";
const OBJECT_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/;

export type ExpectedContent = {
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly mimeType: DocumentMime;
};

export type StoredDocument = "absent" | "matching" | "different";

function assertPath(storagePath: string): void {
  if (!OBJECT_PATH.test(storagePath)) throw new Error("VSD_DOCUMENT_NOT_FOUND");
}

/** null when the object is not there; throws when Storage cannot say. */
async function download(storagePath: string): Promise<Uint8Array | null> {
  assertPath(storagePath);
  const slash = storagePath.indexOf("/");
  const folder = storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);
  // A missing object and a failed download both come back as an error from
  // download(); the listing is what tells them apart.
  const listed = await supabaseAdmin.storage.from(BUCKET).list(folder, { search: name, limit: 10 });
  if (listed.error) throw new Error("VSD_STORAGE_UNAVAILABLE");
  if (!(listed.data ?? []).some((entry) => entry.name === name)) return null;
  const file = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (file.error || !file.data) throw new Error("VSD_STORAGE_UNAVAILABLE");
  return new Uint8Array(await file.data.arrayBuffer());
}

function matches(bytes: Uint8Array, expected: ExpectedContent): boolean {
  return (
    bytes.length === expected.sizeBytes &&
    createHash("sha256").update(bytes).digest("hex") === expected.sha256 &&
    sniffDocumentMime(bytes) === expected.mimeType
  );
}

/** What is really stored at this path, compared with what was declared. */
export async function inspectStoredDocument(
  storagePath: string,
  expected: ExpectedContent,
): Promise<StoredDocument> {
  const bytes = await download(storagePath);
  if (bytes === null) return "absent";
  return matches(bytes, expected) ? "matching" : "different";
}

/** Record the verified match. The database re-checks the row itself. */
export async function stampDocumentContent(input: {
  readonly documentId: string;
  readonly holderUserId: string;
  readonly expected: ExpectedContent;
}): Promise<void> {
  const rpc = supabaseAdmin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
  const { error } = await rpc.call(supabaseAdmin, "vsd_stamp_document_content", {
    _id: input.documentId,
    _holder: input.holderUserId,
    _size_bytes: input.expected.sizeBytes,
    _sha256: input.expected.sha256,
    _mime_type: input.expected.mimeType,
  });
  if (error) {
    const match = /VSD_[A-Z_]+/.exec(error.message);
    throw new Error(match ? match[0] : "VSD_STORAGE_UNAVAILABLE");
  }
}

/**
 * The bytes of a document the database authorized in this same request.
 * They are returned only if they are still exactly the bytes that were
 * verified when the document was attached.
 */
export async function readAuthorizedDocument(
  storagePath: string,
  expected: ExpectedContent,
): Promise<Uint8Array> {
  const bytes = await download(storagePath);
  if (bytes === null || !matches(bytes, expected)) throw new Error("VSD_DOCUMENT_NOT_FOUND");
  return bytes;
}
