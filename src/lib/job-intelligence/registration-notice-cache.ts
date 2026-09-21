// Carrying the announcement's outcome from the call that made it to the page
// that has to be honest about it.
//
// ── WHY THIS IS NEEDED AT ALL ──────────────────────────────────────────
//
// Two different callers create an organisation — the provisioning hook on
// the authenticated shell, and the /employer/onboarding form — and BOTH of
// them then leave for /employer/pending, which is the page that tells a
// company what was and was not done. The outcome of the confirmation email
// is known only inside the call that sent it.
//
// The alternative was to have the review page ask the server, which would
// mean inventing a stored delivery state and reading it back on every visit,
// including the hundred visits that sent nothing. This is the same react-
// query cache the rest of the employer surface already shares, written once
// at the moment the answer exists.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────
//
// It does not persist. A reload clears it, and /employer/pending then says
// nothing about email rather than repeating a claim it can no longer stand
// behind — which is the correct behaviour, not a limitation. The durable
// record lives in `audit_logs` and is read by an administrator on
// /admin/employers/<id>, where a failed send can also be retried.
//
// It is never a source of truth about the REGISTRATION. That is
// `employer_memberships` and `employers.status`, re-read server-side on every
// visit. This carries one sentence about an email and nothing else.

import type { EmployerRegistrationNotice } from "@/lib/job-intelligence/employer-registration-notice.server";

/** The shared react-query key. Cached data only — nothing ever fetches it. */
export const EMPLOYER_REGISTRATION_NOTICE_KEY = ["employer", "registration-notice"] as const;

export type { EmployerRegistrationNotice };
