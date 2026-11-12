// Voluntary self-declarations — the HOLDER'S server functions for the
// Security Passport bridge (20270325090000).
//
// ── WHO DECIDES ─────────────────────────────────────────────────────────
//
// The database, as everywhere in this module. Each function is an
// authenticated call into one vsd_ function made with the CALLER'S OWN
// client, so the live session, ownership, the revision on screen, the
// processing authorization and -- separately -- the disclosure authorization
// are checked there, identically for a request that never came from a screen.
// No service key is used here and nothing is cached.
//
// ── WHAT REACHES THE BROWSER ────────────────────────────────────────────
//
// The narrowed views of passport-bridge.ts: a statement's subject, dates and
// wording version, whether it may be shared, and (for the holder only) its
// provenance level. Never a document, a path, a hash or a recipient's
// identity.
//
// The recipient's read is NOT here: it needs the Passport's share-session
// cookie, so it lives on the Passport side of the bridge
// (src/lib/security-passport/self-declarations-bridge.functions.ts).

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CLOSED_PASSPORT_DECLARATIONS,
  buildPassportDeclarationsView,
  disclosureChoicesSchema,
  parsePassportDeclarations,
  sealedChoicesSchema,
  toCommittedShareOperation,
  toCreatedShare,
  toDisclosedStatements,
  toSharedSelections,
  type CommittedShareOperation,
  type CreatedShare,
  type DisclosedStatement,
  type PassportDeclarationsView,
  type SharedSelection,
} from "./passport-bridge";

type RpcResult = { data: unknown; error: { message: string } | null };
type CallerClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
};

function clientOf(context: unknown): CallerClient {
  return (context as { supabase: unknown }).supabase as CallerClient;
}

/** The database's own refusal code, or a generic one. Never a raw message. */
function refusal(error: { message: string } | null, fallback: string): Error {
  const match = /VSD_[A-Z_]+/.exec(error?.message ?? "");
  return new Error(match ? match[0] : fallback);
}

function uncacheable(): void {
  setResponseHeader("Cache-Control", "no-store, private, max-age=0");
  setResponseHeader("Pragma", "no-cache");
}

/**
 * The holder's current statements, for their own Passport page.
 *
 * A refusal or an unexpected payload is the CLOSED view, never an error the
 * Passport page has to handle and never a positive shield.
 */
export const getMyPassportSelfDeclarations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PassportDeclarationsView> => {
    uncacheable();
    const { data, error } = await clientOf(context).rpc("vsd_my_passport_declarations");
    if (error) return CLOSED_PASSPORT_DECLARATIONS;
    const payload = parsePassportDeclarations(data);
    return payload ? buildPassportDeclarationsView(payload) : CLOSED_PASSPORT_DECLARATIONS;
  });

const choiceInput = z.object({ choices: disclosureChoicesSchema }).strict();

function split(choices: z.infer<typeof sealedChoicesSchema>) {
  return {
    _declaration_ids: choices.map((c) => c.declarationId),
    _revisions: choices.map((c) => c.revision),
  };
}

/** Exactly what a signed-in recipient would receive for this choice. */
export const previewSelfDeclarationDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => choiceInput.parse(data))
  .handler(async ({ context, data }): Promise<readonly DisclosedStatement[]> => {
    uncacheable();
    const { data: payload, error } = await clientOf(context).rpc(
      "vsd_preview_disclosure",
      split(data.choices),
    );
    if (error) throw refusal(error, "VSD_DISCLOSURE_NOT_AUTHORIZED");
    return toDisclosedStatements(payload);
  });

const createInput = z
  .object({
    requestKey: z.string().uuid(),
    link: z
      .object({
        claimIds: z.array(z.string().uuid()).min(1).max(200),
        permittedFields: z.array(z.enum(["holder_name", "identifier", "profile_title"])).max(3),
        expiresDays: z.number().refine((v) => [7, 30, 90].includes(v)),
        locale: z.enum(["sv", "en"]),
      })
      .strict(),
    choices: sealedChoicesSchema,
  })
  .strict();

/**
 * Create ONE credential link together with the holder's choice of statements
 * (possibly none), in one database transaction, under the link's request key.
 *
 * What it throws is the whole contract of the caller's reconciliation:
 *
 *   * the database's own refusal code (VSD_… / SP_…) -- the transaction rolled
 *     back, so NO link exists and nothing is shared;
 *   * `UNCONFIRMED` for everything else -- an unreachable database, a timeout,
 *     an answer that cannot be read. The work may have been committed.
 *
 * Safe to repeat with the same input: the database answers a repeat from what
 * it sealed and creates nothing twice.
 */
export const createShareWithSelfDeclarations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createInput.parse(data))
  .handler(async ({ context, data }): Promise<CreatedShare> => {
    uncacheable();
    let answer: RpcResult;
    try {
      answer = await clientOf(context).rpc("vsd_create_credential_share", {
        _claim_ids: data.link.claimIds,
        _fields: data.link.permittedFields,
        _expires_days: data.link.expiresDays,
        _locale: data.link.locale,
        _request_key: data.requestKey,
        ...split(data.choices),
      });
    } catch {
      throw new Error("UNCONFIRMED");
    }
    if (answer.error) {
      const match = /\b(?:VSD|SP)_[A-Z0-9_]+/.exec(answer.error.message ?? "");
      throw new Error(match ? match[0] : "UNCONFIRMED");
    }
    const created = toCreatedShare(answer.data);
    if (!created) throw new Error("UNCONFIRMED");
    return created;
  });

const operationInput = z.object({ requestKey: z.string().uuid() }).strict();

/**
 * What the database has COMMITTED for one creation operation of the caller's.
 * Read-only; used when the answer to the creation was lost. A failure here is
 * a failure to know, and is thrown as one.
 */
export const getShareOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => operationInput.parse(data))
  .handler(async ({ context, data }): Promise<CommittedShareOperation> => {
    uncacheable();
    const { data: payload, error } = await clientOf(context).rpc("vsd_share_operation", {
      _request_key: data.requestKey,
    });
    if (error) throw new Error("UNCONFIRMED");
    const committed = toCommittedShareOperation(payload);
    if (!committed) throw new Error("UNCONFIRMED");
    return committed;
  });

/** The holder's statements on their links, and whether each still discloses. */
export const listMySharedSelfDeclarations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly SharedSelection[]> => {
    uncacheable();
    const { data, error } = await clientOf(context).rpc("vsd_my_disclosure_selections");
    // Thrown, not answered as "none": an unreadable list must not look like
    // a list in which nothing is shared. The page keeps what it last read.
    if (error) throw refusal(error, "VSD_READ_FAILED");
    return toSharedSelections(data);
  });

const stopInput = z.object({ selectionId: z.string().uuid() }).strict();

/** Stop one statement accompanying one link. The link itself is untouched. */
export const stopSharingSelfDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => stopInput.parse(data))
  .handler(async ({ context, data }): Promise<readonly SharedSelection[]> => {
    const client = clientOf(context);
    const { error } = await client.rpc("vsd_withdraw_disclosure_selection", {
      _id: data.selectionId,
    });
    if (error) throw refusal(error, "VSD_WRITE_FAILED");
    const { data: rows, error: readError } = await client.rpc("vsd_my_disclosure_selections");
    if (readError) throw refusal(readError, "VSD_READ_FAILED");
    return toSharedSelections(rows);
  });
