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
// Tinybird row exists because the hosting supplier's built-in visitor analytics
// sends page views through a processor of its own; the row goes away when the
// owner has turned that analytics off and the live site has been checked.

export type Vendor = {
  /** Stable key. Annex 3 of the processor agreement lists the same ids. */
  readonly id: "supabase" | "lovable" | "tinybird" | "resend" | "smtp" | "google";
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
    purpose: "Drift av webbapplikationen",
    location: "[Ange driftregion]",
    transferSupport: "[Ange överföringsstöd]",
  },
  {
    // Reported by the release session from the supplier's own description of
    // its "Visitor analytics" (2026-10-04); not verified against a contract or
    // the supplier's sub-processor list. Until the owner turns that analytics
    // off, page views reach it through Lovable (policy section 11).
    id: "tinybird",
    name: "Tinybird (anlitas av Lovable för besöksstatistiken)",
    purpose: "Lagring och analys av sidvisningar i Lovables besöksstatistik, tills den är avstängd",
    location: "[Ange plats för Tinybirds behandling]",
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
