// Security Passport — how a derived title is printed.
//
// ── ONE DERIVATION, ONE WAY OF SHOWING IT ──────────────────────────────
//
// Seven surfaces print a professional title: the overview, the Passport Card,
// the recipient page, the social frame, the LinkedIn output, the shared image
// and the employer's view of an application. Each used to read a stored string
// and format it however it liked.
//
// The engine fixed WHAT they show. This fixes HOW, because two surfaces that
// disagree about whether to show one title or three are still telling a reader
// two different stories about the same person.
//
// ── A LEGAL NAME IS NOT A TRANSLATION TARGET ───────────────────────────
//
// "Ordningsvakt" is what the Swedish appointment is called. Rendering it as
// "Public Order Guard" to an English reader is fine as an EXPLANATION and
// wrong as a substitute: the reader who needs to check the credential needs
// the word that appears on it.
//
// So a title carries both, and `labelFor` shows the market's own legal name to
// a reader in that market's language and the safe explanatory name otherwise.
// It never renders one market's legal name in another market's vocabulary,
// which is the cross-market equivalence claim this product refuses to make.

import type { DerivedTitle, ProfessionalIdentity, PublicTitle } from "./types";

/** The Passport's reader languages. Kept local rather than imported from the
 *  copy module so this file stays a pure domain module. */
export type IdentityLang = "sv" | "en" | "ar";

/** Which language a market's own legal vocabulary is written in.
 *
 *  A presentation fact, not a legal one: it decides which of a title's two
 *  names to print, and nothing about what the title means. Keyed on the
 *  country so a market pack added later inherits the right default. */
function localLanguageOf(marketPackCode: string): IdentityLang {
  switch (marketPackCode.slice(0, 2)) {
    case "SE":
      return "sv";
    case "AE":
      return "ar";
    default:
      return "en";
  }
}

/**
 * The label to print for one reader.
 *
 * Falls back to the explanatory English name whenever the local name would be
 * in a language the reader does not have — including when `nameAr` is still
 * null because no competent reviewer has supplied it. A missing Arabic legal
 * term is shown as English rather than as an empty string or a machine
 * translation: an unreviewed legal term that looks authoritative is worse than
 * an honest English one.
 */
/** The minimum a value needs to be printable as a title. Structural on
 *  purpose: a `DerivedTitle` and the reduced `PublicTitle` must render
 *  identically, and requiring the full type here would have forced the social
 *  card to carry fields it must not have. */
export type Labelled = Pick<DerivedTitle, "nameLocal" | "nameEn" | "nameAr" | "marketPackCode">;

export function labelFor(title: Labelled, lang: IdentityLang): string {
  const local = localLanguageOf(title.marketPackCode);

  if (lang === local) {
    if (lang === "ar") return title.nameAr ?? title.nameEn;
    return title.nameLocal;
  }
  return title.nameEn;
}

/**
 * The strongest thing this person may currently be called, and only that tier.
 *
 * Active titles if there are any; otherwise competence; otherwise completed
 * education; otherwise nothing. Deliberately NOT a merged list — showing
 * "Ordningsvakt" beside "Väktarutbildning 1 completed" invites a reader to
 * treat them as two equal facts, when one is a current legal authorisation and
 * the other is a course somebody finished.
 */
export function headlineTitles(identity: ProfessionalIdentity): readonly DerivedTitle[] {
  if (identity.activeTitles.length > 0) return identity.activeTitles;
  if (identity.professionalCompetence.length > 0) return identity.professionalCompetence;
  if (identity.educationCompleted.length > 0) return identity.educationCompleted;
  return [];
}

/**
 * The headline as one line.
 *
 * Several simultaneous titles are joined, never collapsed: somebody who is
 * both an Ordningsvakt and a Skyddsvakt holds two separate appointments from
 * two separate authorities, and inventing a combined word for that would name
 * a job that does not exist.
 *
 * `fallback` is supplied by the caller because it is user-facing copy and
 * belongs in the copy module, which this file must not depend on.
 */
export function joinTitles(
  titles: readonly Labelled[],
  lang: IdentityLang,
  fallback: string,
): string {
  if (titles.length === 0) return fallback;
  return titles.map((t) => labelFor(t, lang)).join(" · ");
}

export function professionLine(
  identity: ProfessionalIdentity,
  lang: IdentityLang,
  fallback: string,
): string {
  return joinTitles(headlineTitles(identity), lang, fallback);
}

/** The headline, reduced to what may leave the product in an image or on a
 *  public page. Deliberately drops `expiresOn`, `sourceClaimIds`,
 *  `scopeRestriction` and `evidence` rather than nulling them. */
export function toPublicTitles(identity: ProfessionalIdentity): readonly PublicTitle[] {
  return headlineTitles(identity).map((t) => ({
    ruleCode: t.ruleCode,
    outputKind: t.outputKind,
    nameLocal: t.nameLocal,
    nameEn: t.nameEn,
    nameAr: t.nameAr,
    jurisdictionCode: t.jurisdictionCode,
    marketPackCode: t.marketPackCode,
  }));
}

/** Whether anything in the headline rests on evidence nobody checked. Drives
 *  the Egenrapporterad / Self-declared marker; never inferred from the copy. */
export function headlineIsSelfDeclared(identity: ProfessionalIdentity): boolean {
  return headlineTitles(identity).some((t) => t.selfDeclared);
}

/** Every distinct jurisdiction the headline spans. A recipient must be told
 *  when the titles in front of them come from different markets, because
 *  nothing about one implies anything about the other. */
export function headlineJurisdictions(identity: ProfessionalIdentity): readonly string[] {
  return Array.from(new Set(headlineTitles(identity).map((t) => t.jurisdictionCode)));
}
