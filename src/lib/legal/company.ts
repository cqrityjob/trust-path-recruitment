// Who provides CQrityjob, named once (owner decision, 2026-10-04).
//
// Cqrityjobb AB is the contracting party and the data controller. CQrityjob
// is the brand. The earlier provider name ("Cqrityjob LLC") is retired in
// every current text: the terms, the privacy policy, the web texts and the
// processor agreement. Historical records keep it, with a dated note saying
// why (docs/legal/2026-10-04-owner-decisions.md).
//
// The company's postal address is not here on purpose: it is an open fact the
// owner has not supplied yet, and the documents show it as a visible gap
// until they have it (docs/legal/open-facts-2026-10-04.md). Do not invent one.

import { CONTACT_EMAIL, JOB_EMAIL } from "../site-contact";

export const COMPANY = {
  legalName: "Cqrityjobb AB",
  organisationNumber: "559261-0249",
  brand: "CQrityjob",
  /** Contact, support and privacy questions. */
  contactEmail: CONTACT_EMAIL,
  /** Recruitment and candidate communication (replies to an employer's mail). */
  recruitmentEmail: JOB_EMAIL,
} as const;
