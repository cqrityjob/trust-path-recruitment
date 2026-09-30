// A recruitment enquiry from /contact — the shape, shared by the form and
// the server function so the two cannot validate differently.
//
// ── GDPR-MINIMAL BY CONSTRUCTION ───────────────────────────────────────
//
// Four things are asked for, because a reply needs them: which service, a
// name, an organisation and an address to answer. The message is optional.
// Nothing is stored in the platform: the enquiry is handed to the mail
// provider and addressed to CQrityjob's configured inbox, and that is all.
// The form asks the sender not to write about candidates.

import { z } from "zod";

export const ENQUIRY_SERVICES = ["recruitment", "executive", "interim"] as const;
export type EnquiryService = (typeof ENQUIRY_SERVICES)[number];

export const ENQUIRY_LIMITS = {
  name: 120,
  organisation: 160,
  email: 254,
  message: 2000,
} as const;

export const recruitmentEnquirySchema = z.object({
  service: z.enum(ENQUIRY_SERVICES),
  name: z.string().trim().min(1).max(ENQUIRY_LIMITS.name),
  organisation: z.string().trim().min(1).max(ENQUIRY_LIMITS.organisation),
  email: z.string().trim().email().max(ENQUIRY_LIMITS.email),
  message: z.string().trim().max(ENQUIRY_LIMITS.message).default(""),
  language: z.enum(["sv", "en"]),
  /** A field a person never sees. Filled in, the request is from a bot. */
  website: z.string().max(500).default(""),
});

export type RecruitmentEnquiry = z.infer<typeof recruitmentEnquirySchema>;

/** What the form is told. `sent` means the mail provider ACCEPTED the
 *  message — the strongest claim available — never that anybody read it.
 *  `closed` means no mail transport is configured, so nothing was sent. */
export type RecruitmentEnquiryResult =
  | { readonly status: "sent" }
  | { readonly status: "closed" }
  | { readonly status: "rate_limited" }
  | { readonly status: "failed" };

export function isEnquiryService(value: unknown): value is EnquiryService {
  return typeof value === "string" && (ENQUIRY_SERVICES as readonly string[]).includes(value);
}
