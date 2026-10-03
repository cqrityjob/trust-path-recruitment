// CQrityjob's public addresses, named once (owner, 2026-10-03).
//
//   info@cqrityjob.com      contact, support and privacy questions
//   job@cqrityjob.com       recruitment and candidate communication
//   no-reply@cqrityjob.com  automated mail only; never shown as a contact
//
// The mail function (supabase/functions/transactional-email) holds its own
// copy, because it runs on Deno outside this bundle; transactional-email
// check pins that the two agree.

export const CONTACT_EMAIL = "info@cqrityjob.com";
export const JOB_EMAIL = "job@cqrityjob.com";
export const NO_REPLY_EMAIL = "no-reply@cqrityjob.com";
