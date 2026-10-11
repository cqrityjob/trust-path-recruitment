// The candidate's own half of a supplement (slot 20270314100000, registered
// as installed): an answer written IN THE APP to a supplement request the
// employer actually sent, kept with the application, read by the reviewer in
// the supplement panel and by the candidate who wrote it.
//
// What this file does not do: send anything (no e-mail, no message of its
// own), change the CV or the original answers, or resolve the request --
// "answered" stays the reviewer's act (rec_ri_resolve_supplement). The
// database refuses a reply to a draft, to another person's file, to a closed
// application and to a resolved request; the codes below name those refusals
// so the inbox can say the right sentence.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSchemaMissing } from "./lifecycle-v03.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Ctx = { supabase: Loose; userId: string };

export const CANDIDATE_REPLY_CODES = [
  "MESSAGE_NOT_FOUND",
  "REPLY_NOT_ALLOWED",
  "APPLICATION_NOT_OPEN",
  "REPLY_BODY_INVALID",
  "SUPPLEMENT_ALREADY_RESOLVED",
] as const;
export type CandidateReplyErrorCode =
  | (typeof CANDIDATE_REPLY_CODES)[number]
  | "REPLY_NOT_INSTALLED"
  | "RECRUITMENT_ACTION_FAILED";

export const REPLY_MAX_LENGTH = 4000;

export const candidateReplyInputSchema = z.object({
  messageId: z.string().uuid(),
  body: z.string().trim().min(1).max(REPLY_MAX_LENGTH),
  language: z.enum(["sv", "en"]),
});

const replyReceiptSchema = z.object({
  replyId: z.string(),
  messageId: z.string(),
  requestId: z.string().nullable(),
  applicationId: z.string(),
  createdAt: z.string(),
});
export type CandidateReplyReceipt = z.infer<typeof replyReceiptSchema>;

/** PostgREST answers PGRST205 ("Could not find the table …") for a table the
 *  schema cache does not hold; Postgres itself answers 42P01. Either reads as
 *  "the slot is not installed here". */
function isTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /Could not find the table/i.test(error.message ?? "") ||
    isSchemaMissing(error)
  );
}

/** Write the candidate's answer. Throws one of CandidateReplyErrorCode. */
export const replyToSupplementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => candidateReplyInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<CandidateReplyReceipt> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_candidate_reply_to_message", {
      _message_id: data.messageId,
      _body: data.body,
      _language: data.language,
    });
    if (result.error) {
      if (isSchemaMissing(result.error)) throw new Error("REPLY_NOT_INSTALLED");
      const message = String(result.error.message ?? "");
      const code = CANDIDATE_REPLY_CODES.find((c) => message.includes(c));
      if (code) throw new Error(code);
      console.error("[recruitment] candidate reply failed", result.error);
      throw new Error("RECRUITMENT_ACTION_FAILED");
    }
    return replyReceiptSchema.parse(result.data);
  });

export type CandidateReply = {
  replyId: string;
  messageId: string;
  body: string;
  language: "sv" | "en" | null;
  createdAt: string;
};
export type CandidateReplies =
  | { installed: false; replies: [] }
  | { installed: true; replies: CandidateReply[] };

/** The signed-in candidate's own replies, under RLS (created_by = auth.uid()).
 *  Where the slot is not installed the read says so instead of failing the
 *  page: the inbox then tells the candidate to answer the way the message
 *  says. */
export const listMyCandidateReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CandidateReplies> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase
      .from("rec_candidate_replies")
      .select("id, message_id, body, language, created_at")
      .order("created_at", { ascending: true })
      .limit(500);
    if (result.error) {
      if (isTableMissing(result.error)) return { installed: false, replies: [] };
      console.error("[recruitment] candidate replies read failed", result.error);
      throw new Error("RECRUITMENT_ACTION_FAILED");
    }
    const rows = (result.data ?? []) as {
      id: string;
      message_id: string;
      body: string;
      language: string | null;
      created_at: string;
    }[];
    return {
      installed: true,
      replies: rows.map((r) => ({
        replyId: r.id,
        messageId: r.message_id,
        body: r.body,
        language: r.language === "sv" || r.language === "en" ? r.language : null,
        createdAt: r.created_at,
      })),
    };
  });
