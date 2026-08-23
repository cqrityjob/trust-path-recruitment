// Security Passport — the professional identity derivation engine.
//
// ── THE ONE PLACE THIS MAPPING EXISTS ──────────────────────────────────
//
// Before this module, `buildPassportCard` printed `holder.professionTitleSv`,
// and the server set that string to the literal "Väktare" for every holder who
// had ever signed in — whether they held VU1, held nothing at all, or held a
// current ordningsvaktsförordnande. Six surfaces read it independently.
//
// So the rule is now absolute: no component, no route and no server function
// maps a credential to a title. They call this, and this reads rules that live
// in `sp_professional_titles`. `scripts/passport-title-derivation-check.ts`
// fails the build if a credential code and a title string appear together
// anywhere else.
//
// ── WHY IT IS A PURE FUNCTION OVER CLAIMS ──────────────────────────────
//
// Because expiry has to be free. A stored title needs something to unset it on
// the day an appointment lapses — a job, a sweep, a login hook — and all of
// those fail silently, leaving a lapsed authorisation reading as a current
// professional title on the artefact people screenshot. Deriving it at read
// time cannot fail that way: the appointment expired, so the title is not in
// today's output. There is nothing to forget to run.
//
// ── AND, NOT OR ────────────────────────────────────────────────────────
//
// `requiresCredentialCodes` is a conjunction. Every listed credential must be
// held AND satisfy the rule's evidence and currency bars. "VU1 or VU2 makes
// you a Väktare" is precisely the rule this product must not have, and
// `everyRequirementMet` below is where that is decided — once.

import { assertionAtLeast, countsTowardExperience } from "../types";
import type { AssertionLevel, Claim, IsoDate } from "../types";
import { validityOf } from "../validity";
import type { DerivedTitle, ProfessionalIdentity, TitleRule } from "./types";

/** Changes whenever the DERIVATION changes — not when a rule's label is
 *  reworded. Stamped into disclosure snapshots so a share can always be
 *  explained by the engine that produced it. */
export const IDENTITY_ENGINE_VERSION = "identity-v1";

export interface DeriveOptions {
  /** Allow evidence weaker than the rule demands, marking anything that only
   *  qualifies because of it. Defaults to FALSE: the safe derivation is the
   *  one you get by not thinking about it. */
  readonly includeSelfDeclared?: boolean;
}

const ASSERTION_ORDER: readonly AssertionLevel[] = [
  "self_declared",
  "document_provided",
  "verified",
];

function weakest(levels: readonly AssertionLevel[]): AssertionLevel {
  for (const level of ASSERTION_ORDER) {
    if (levels.includes(level)) return level;
  }
  return "verified";
}

/** Whether one claim can stand behind one rule.
 *
 *  Currency is checked through `validityOf`, which applies the calendar to a
 *  stored state. That matters twice over: an appointment whose `validUntil`
 *  passed yesterday is `expired` today even though nothing wrote it, and a
 *  `revoked` or `disputed` credential is never rescued by a future date. */
function claimSatisfies(
  claim: Claim,
  rule: TitleRule,
  evaluationOn: IsoDate,
  floor: AssertionLevel,
): boolean {
  if (!assertionAtLeast(claim.assertionLevel, floor)) return false;

  const validity = validityOf(claim.lifecycleState, claim.validUntil, evaluationOn);

  if (rule.requiresCurrentValidity) {
    return validity.effectiveState === "active";
  }

  // Even when currency is not required, a decision against the credential
  // still ends its contribution. `countsTowardExperience` is the existing
  // definition of "this entry is live"; reusing it keeps titles and experience
  // from disagreeing about whether a revoked entry counts.
  return countsTowardExperience(claim.lifecycleState);
}

/** The best claim for one required code: strongest evidence first, then the
 *  one that stays valid longest. Deterministic, so two reads of the same
 *  Passport can never attribute a title to different claims. */
function bestFor(candidates: readonly Claim[]): Claim {
  return [...candidates].sort((a, b) => {
    const byEvidence =
      ASSERTION_ORDER.indexOf(b.assertionLevel) - ASSERTION_ORDER.indexOf(a.assertionLevel);
    if (byEvidence !== 0) return byEvidence;

    const av = a.validUntil ? Date.parse(a.validUntil) : Number.MAX_SAFE_INTEGER;
    const bv = b.validUntil ? Date.parse(b.validUntil) : Number.MAX_SAFE_INTEGER;
    if (av !== bv) return bv - av;

    // Final tiebreak on id so the result is stable rather than merely usually
    // stable. Sort comparators that can return 0 for distinct rows produce
    // engine-dependent ordering, and this output feeds a shared artefact.
    return a.id.localeCompare(b.id);
  })[0];
}

function deriveOne(
  rule: TitleRule,
  claims: readonly Claim[],
  evaluationOn: IsoDate,
  includeSelfDeclared: boolean,
): DerivedTitle | null {
  const floor: AssertionLevel = includeSelfDeclared ? "self_declared" : rule.requiresAssertionLevel;

  const chosen: Claim[] = [];
  for (const code of rule.requiresCredentialCodes) {
    const candidates = claims.filter(
      (c) => c.credentialCode === code && claimSatisfies(c, rule, evaluationOn, floor),
    );
    // One missing requirement ends it. This is the AND.
    if (candidates.length === 0) return null;
    chosen.push(bestFor(candidates));
  }

  // Every source must agree on where it applies. A rule can only name
  // credentials from its own market (the database refuses otherwise), so
  // disagreement here means data that should not exist — and the safe
  // response to "this Passport says two countries at once" is to derive
  // nothing rather than to pick one.
  const jurisdictions = new Set(chosen.map((c) => c.jurisdictionCode ?? ""));
  if (jurisdictions.size !== 1) return null;
  const jurisdictionCode = chosen[0].jurisdictionCode;
  if (!jurisdictionCode) return null;

  // Same reasoning for the emirate: sources that disagree about WHERE they
  // were issued cannot jointly support one local title.
  const subJurisdictions = new Set(chosen.map((c) => c.subJurisdictionCode ?? null));
  if (subJurisdictions.size !== 1) return null;
  const subJurisdictionCode = chosen[0].subJurisdictionCode;

  const expiries = chosen
    .map((c) => c.validUntil)
    .filter((d): d is IsoDate => Boolean(d))
    .sort();

  // Every scope any source carries, joined. A title limited by two of its
  // sources is limited by both, and dropping either would widen it.
  const scopes = chosen
    .map((c) => c.authorisationScope)
    .filter((v): v is string => Boolean(v && v.trim()));

  const evidence = weakest(chosen.map((c) => c.assertionLevel));

  return {
    ruleCode: rule.code,
    outputKind: rule.outputKind,
    nameLocal: rule.nameLocal,
    nameEn: rule.nameEn,
    nameAr: rule.nameAr,
    jurisdictionCode,
    subJurisdictionCode,
    marketPackCode: rule.marketPackCode,
    regulatedRoleCode: rule.regulatedRoleCode,
    professionFamilyCode: rule.professionFamilyCode,
    sourceClaimIds: chosen.map((c) => c.id),
    evidence,
    // Not "is the evidence weak" but "did we let it through below the bar".
    selfDeclared: !assertionAtLeast(evidence, rule.requiresAssertionLevel),
    expiresOn: expiries[0] ?? null,
    scopeRestriction: scopes.length > 0 ? Array.from(new Set(scopes)).join(" · ") : null,
  };
}

function byPriority(rules: readonly TitleRule[]): readonly TitleRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
}

/**
 * Derives everything the holder may currently be said to be.
 *
 * Callers should prefer the two named wrappers in `visibility.ts`, which make
 * the audience explicit at the call site. This function is exported for the
 * table-driven tests and for callers that genuinely need to pass options.
 */
export function deriveProfessionalIdentity(
  claims: readonly Claim[],
  rules: readonly TitleRule[],
  evaluationOn: IsoDate,
  options: DeriveOptions = {},
): ProfessionalIdentity {
  const includeSelfDeclared = options.includeSelfDeclared === true;

  const derived = byPriority(rules)
    .filter((r) => r.requiresCredentialCodes.length > 0)
    .map((rule) => deriveOne(rule, claims, evaluationOn, includeSelfDeclared))
    .filter((d): d is DerivedTitle => d !== null);

  const of = (kind: DerivedTitle["outputKind"]) => derived.filter((d) => d.outputKind === kind);

  return {
    engineVersion: IDENTITY_ENGINE_VERSION,
    evaluatedOn: evaluationOn,
    includesSelfDeclared: includeSelfDeclared,
    educationCompleted: of("education_completed"),
    professionalCompetence: of("professional_competence"),
    localEligibility: of("local_eligibility"),
    activeTitles: of("active_title"),
  };
}

/** Every derived output in one list, for callers that legitimately need the
 *  whole picture — the holder's own overview, and the tests. Deliberately not
 *  the default shape: see the note in `types.ts` about why the four outputs
 *  are separate arrays. */
export function allDerived(identity: ProfessionalIdentity): readonly DerivedTitle[] {
  return [
    ...identity.activeTitles,
    ...identity.localEligibility,
    ...identity.professionalCompetence,
    ...identity.educationCompleted,
  ];
}
