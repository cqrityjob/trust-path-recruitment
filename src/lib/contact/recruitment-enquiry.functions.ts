import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { clientIpHint } from "@/lib/http/client-ip";
import {
  recruitmentEnquirySchema,
  type RecruitmentEnquiryResult,
} from "@/lib/contact/recruitment-enquiry";

// The two server functions behind /contact. Public: an enquiry needs no
// account. The enquiry itself is never written to the database.
//
// ── ABUSE LIMITS ───────────────────────────────────────────────────────
//
// 1. A hidden honeypot field.
// 2. Durable limits in the database (enquiry-throttle.server.ts): per client
//    address per hour, and per recipient address per day. Only hashed
//    bucket keys are stored, never the enquiry.
// 3. In-memory limits per server instance, as a backstop that still holds if
//    the durable throttle is unreachable: a few enquiries per sender address
//    per hour, and a ceiling on all enquiries per ten minutes.
//
// They only ever refuse; they never send.

const PER_ADDRESS_LIMIT = 3;
const PER_ADDRESS_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LIMIT = 30;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

const byAddress = new Map<string, number[]>();
let recentAll: number[] = [];

function allow(address: string, now: number): boolean {
  recentAll = recentAll.filter((t) => now - t < GLOBAL_WINDOW_MS);
  if (recentAll.length >= GLOBAL_LIMIT) return false;
  const key = address.toLowerCase();
  const recent = (byAddress.get(key) ?? []).filter((t) => now - t < PER_ADDRESS_WINDOW_MS);
  if (recent.length >= PER_ADDRESS_LIMIT) {
    byAddress.set(key, recent);
    return false;
  }
  recent.push(now);
  byAddress.set(key, recent);
  recentAll.push(now);
  if (byAddress.size > 5000) byAddress.clear();
  return true;
}

/** Whether the form can send at all. A boolean, never the missing names. */
export const getRecruitmentEnquiryAvailability = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ open: boolean }> => {
    const { recruitmentEnquiryOpen } =
      await import("@/lib/email/send-recruitment-enquiry-email.server");
    return { open: await recruitmentEnquiryOpen() };
  },
);

export const sendRecruitmentEnquiry = createServerFn({ method: "POST" })
  .inputValidator((input) => recruitmentEnquirySchema.parse(input))
  .handler(async ({ data }): Promise<RecruitmentEnquiryResult> => {
    // A person never sees the honeypot, so only a bot fills it. It is told
    // what a person would be told, and nothing is sent.
    if (data.website) return { status: "sent" };

    const {
      missingRecruitmentEnquirySettings,
      sendRecruitmentEnquiryEmail,
      sendEnquiryAcknowledgementEmail,
    } = await import("@/lib/email/send-recruitment-enquiry-email.server");
    if (missingRecruitmentEnquirySettings().length > 0) return { status: "closed" };

    const { takeEnquiryAllowance } = await import("./enquiry-throttle.server");
    const durable = await takeEnquiryAllowance(clientIpHint(getRequest()?.headers), data.email);
    if (durable === false) return { status: "rate_limited" };
    if (!allow(data.email, Date.now())) return { status: "rate_limited" };

    const outcome = await sendRecruitmentEnquiryEmail(data);
    if (outcome.status === "sent") {
      // Only after CQrityjob's inbox has the enquiry. Best effort: its own
      // failure is logged in the sender and does not change what the
      // enquirer is told, because the enquiry itself did arrive.
      await sendEnquiryAcknowledgementEmail(data);
      return { status: "sent" };
    }
    if (outcome.status === "not_configured") return { status: "closed" };
    return { status: "failed" };
  });
