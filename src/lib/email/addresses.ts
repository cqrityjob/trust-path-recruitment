// CQrityjob's human mailboxes, used as Reply-To on automated mail.
//
// Automated mail is SENT from RESEND_FROM_EMAIL (a no-reply sender on the
// verified domain); these are where a person's reply should land:
//
//   * info@ — general, employer, recruitment and admin contact. Configured as
//     ADMIN_NOTIFICATION_EMAIL (the contact form's inbox and Reply-To).
//   * job@  — candidate and job communication that CQrityjob itself sends,
//     e.g. the application receipt. Not used for messages an EMPLOYER writes:
//     a candidate's reply to those belongs to the employer, not CQrityjob.

export const CANDIDATE_REPLY_TO_EMAIL = "job@cqrityjob.com";
