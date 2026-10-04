// The suppliers that process personal data for CQrityjob, named once.
//
// Used by the privacy policy (section 6: who gets access, with the place of
// processing and the transfer support) and mirrored by name in Annex 3 of the
// processor agreement (docs/legal/personuppgiftsbitradesavtal-utkast.md);
// `launch-legal:check` fails when the two lists differ.
//
// A cell that is still an undecided fact is a bracketed "[Ange …]". It is
// rendered as a visible gap and keeps the document a draft. Do not fill one
// in from memory: each needs the supplier's own statement or contract
// (docs/legal/open-facts-2026-10-04.md).
//
// Verified 2026-10-04: the Supabase project runs in eu-central-1 (Frankfurt),
// read from the project record. Nothing else in this table is verified. The
// Cloudflare row exists because the hosting layer's `__cf_bm` cookie shows that
// Cloudflare is in the delivery path. (A Tinybird row for the hosting supplier's
// visitor analytics was removed once the owner had turned that analytics off and
// the live site had been checked, 2026-10-04.)

export type Vendor = {
  /** Stable key. Annex 3 of the processor agreement lists the same ids. */
  readonly id: "supabase" | "lovable" | "cloudflare" | "resend" | "smtp" | "google";
  readonly name: string;
  readonly purpose: string;
  /** Where the supplier processes the data. */
  readonly location: string;
  /** What lawfully supports a transfer outside the EU/EEA. */
  readonly transferSupport: string;
};

export const VENDORS: readonly Vendor[] = [
  {
    id: "supabase",
    name: "Supabase",
    purpose: "Databas, inloggning, fillagring, loggar och serverfunktioner",
    location: "Frankfurt, Tyskland (EU)",
    transferSupport: "[Ange stöd för eventuell åtkomst från tredje land]",
  },
  {
    id: "lovable",
    name: "Lovable",
    purpose: "Drift (hosting) av webbapplikationen",
    location: "[Ange driftregion]",
    transferSupport: "[Ange överföringsstöd]",
  },
  {
    // Observed by the release session on the live site (2026-10-04): the
    // `__cf_bm` cookie is Cloudflare's bot management, so Cloudflare sits in the
    // delivery path of the published pages (a CDN and protection layer run by the
    // hosting supplier). Its place of processing and its transfer support are not
    // verified.
    id: "cloudflare",
    name: "Cloudflare (CDN och skydd för driften)",
    purpose: "Leverans av sidor och skydd mot automatiserad trafik",
    location: "[Ange plats för Cloudflares behandling]",
    transferSupport: "[Ange överföringsstöd]",
  },
  {
    id: "resend",
    name: "Resend",
    purpose: "Utskick av systemmejl, till exempel kvitton, meddelanden och notiser",
    location: "[Ange sändningsregion]",
    transferSupport: "[Ange överföringsstöd]",
  },
  {
    id: "smtp",
    name: "[Ange e-postleverantörens namn]",
    purpose: "Inloggningsmejl och brevlådorna info@ och job@",
    location: "[Ange region]",
    transferSupport: "[Ange överföringsstöd]",
  },
  {
    id: "google",
    name: "Google",
    purpose: "Inloggning med Google, bara om du väljer det",
    location: "[Ange plats för Googles behandling]",
    transferSupport: "[Ange överföringsstöd]",
  },
];
