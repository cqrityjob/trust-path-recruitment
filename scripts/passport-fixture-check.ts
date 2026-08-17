// Security Passport — fixture, calculation and contract regression guard.
//
// Phase 1 has no database, so the invariants that will later be database
// triggers are asserted here against the pure domain functions. Each block
// corresponds to a rule in Product Architecture v1.1 that a reviewer would
// otherwise have to take on trust.
//
// Plain TS script run with Bun, matching scripts/*-check.ts convention.

import {
  DAYS_PER_YEAR,
  toDuration,
  totalForPeriods,
  totalsByEvidenceLevel,
} from "../src/lib/security-passport/experience";
import {
  RECOGNITION_THRESHOLD_YEARS,
  mayShowBadge,
  recognitionFor,
} from "../src/lib/security-passport/recognition";
import {
  DISCLOSURE_PACKAGES,
  buildDisclosurePayload,
  packageById,
  shareStatus,
} from "../src/lib/security-passport/disclosure";
import { buildPassportCard } from "../src/lib/security-passport/card";
import {
  DISCLOSURE_FIXTURES,
  FIXTURE_EVALUATION_DATE,
  PERSONAS,
  personaById,
} from "../src/lib/security-passport/fixtures/personas";
import { passportCopy, type PassportCopyKey } from "../src/lib/security-passport/i18n";
import { ASSERTION_LEVELS, LIFECYCLE_STATES } from "../src/lib/security-passport/types";
import { buildSocialCard, SOCIAL_FORBIDDEN_KEYS } from "../src/lib/security-passport/social";
import {
  SHARE_FORMATS,
  TRUST_PALETTE,
  milestoneStyle,
} from "../src/lib/security-passport/design/trust-system";
import {
  CREDENTIAL_PRESENTATION_STATES,
  SYMBOL_CODES,
  credentialPresentation,
  credentialSymbolMarkup,
  symbolTreatment,
} from "../src/lib/security-passport/design/credential-symbols";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const EVAL = FIXTURE_EVALUATION_DATE;
const years = (days: number) => days / DAYS_PER_YEAR;

// ---------------------------------------------------------------------------
// 1. Interval union — no double counting
// ---------------------------------------------------------------------------
{
  const bjorn = personaById("overlapping-employers");
  const total = totalForPeriods(bjorn.periods, EVAL);

  const naiveDays = bjorn.periods
    .filter((p) => p.lifecycleState === "active")
    .reduce((sum, p) => {
      const end = p.endedOn ? Date.parse(p.endedOn) : Date.parse(EVAL);
      return sum + (end - Date.parse(p.startedOn)) / 86_400_000;
    }, 0);

  expect(
    total.elapsedDays < naiveDays,
    `Overlapping periods must not be double counted: union ${years(total.elapsedDays).toFixed(2)}y is not less than naive sum ${years(naiveDays).toFixed(2)}y.`,
  );

  // p-bjorn-2 lies wholly inside p-bjorn-1, so it can add no elapsed time.
  const withoutInner = totalForPeriods(
    bjorn.periods.filter((p) => p.id !== "p-bjorn-2"),
    EVAL,
  );
  expect(
    Math.abs(withoutInner.elapsedDays - total.elapsedDays) < 0.5,
    `A period wholly contained in another must contribute no elapsed time (delta ${(total.elapsedDays - withoutInner.elapsedDays).toFixed(2)} days).`,
  );
}

// ---------------------------------------------------------------------------
// 2. Excluded lifecycle states
// ---------------------------------------------------------------------------
{
  const hugo = personaById("disputed-claim");
  const total = totalForPeriods(hugo.periods, EVAL);
  const activeOnly = totalForPeriods(
    hugo.periods.filter((p) => p.lifecycleState === "active"),
    EVAL,
  );
  expect(
    Math.abs(total.elapsedDays - activeOnly.elapsedDays) < 0.5,
    "A disputed period must be excluded from experience totals.",
  );
  expect(
    !total.contributingPeriodIds.includes("p-hugo-2"),
    "A disputed period must not appear in the contributing basis.",
  );
}

// ---------------------------------------------------------------------------
// 3. Part-time: elapsed and FTE stay separate
// ---------------------------------------------------------------------------
{
  const saga = personaById("part-time");
  const total = totalForPeriods(saga.periods, EVAL);
  expect(
    total.fteWeightedDays < total.elapsedDays,
    "A 50% part-time period must produce a smaller FTE figure than elapsed time.",
  );
  expect(
    Math.abs(total.fteWeightedDays * 2 - total.elapsedDays) < 1,
    `A 0.5 FTE period must weight to half its elapsed time (elapsed ${total.elapsedDays.toFixed(1)}, fte ${total.fteWeightedDays.toFixed(1)}).`,
  );
}

// ---------------------------------------------------------------------------
// 4. Partial security relevance is weighted, never assumed
// ---------------------------------------------------------------------------
{
  const vera = personaById("mixed-evidence");
  const partial = vera.periods.find((p) => p.securityRelevance === "partial");
  expect(
    partial !== undefined,
    "The mixed-evidence persona must carry a partial-relevance period.",
  );
  if (partial) {
    expect(
      partial.securityFraction > 0 && partial.securityFraction < 1,
      "A partial-relevance period must state an explicit fraction between 0 and 1.",
    );
  }
}

// ---------------------------------------------------------------------------
// 5. The three totals are nested by construction
// ---------------------------------------------------------------------------
for (const persona of PERSONAS) {
  const t = totalsByEvidenceLevel(persona.periods, EVAL);
  expect(
    t.verified.elapsedDays <= t.documented.elapsedDays + 0.001,
    `${persona.id}: verified experience must never exceed documented.`,
  );
  expect(
    t.documented.elapsedDays <= t.reported.elapsedDays + 0.001,
    `${persona.id}: documented experience must never exceed reported.`,
  );
}

// ---------------------------------------------------------------------------
// 6. Recognition: VERIFIED-only, mixed evidence yields no badge
// ---------------------------------------------------------------------------
{
  const vera = personaById("mixed-evidence");
  const t = totalsByEvidenceLevel(vera.periods, EVAL);
  const r = recognitionFor(t);

  expect(
    years(t.reported.elapsedDays) >= 5,
    "The mixed-evidence persona must report at least five years, or the case is not exercised.",
  );
  expect(
    years(t.verified.elapsedDays) < 5,
    "The mixed-evidence persona must have under five VERIFIED years.",
  );
  expect(
    r.earnedYears !== 5 && (r.earnedYears ?? 0) < 5,
    "Mixed evidence must not produce a five-year recognition.",
  );
  expect(
    r.blockedByMixedEvidence,
    "The mixed-evidence case must be flagged so the UI can explain the missing badge.",
  );
}

{
  const elias = personaById("five-verified-years");
  const r = recognitionFor(totalsByEvidenceLevel(elias.periods, EVAL));
  expect(mayShowBadge(r), "A fully verified holder past five years must earn a recognition.");
  expect(r.earnedYears === 5, `Expected a five-year recognition, got ${r.earnedYears}.`);
}

// A recognition may never rest on unverified time, for any persona.
for (const persona of PERSONAS) {
  const t = totalsByEvidenceLevel(persona.periods, EVAL);
  const r = recognitionFor(t);
  if (r.earnedYears !== null) {
    expect(
      t.verified.elapsedDays >= r.earnedYears * DAYS_PER_YEAR,
      `${persona.id}: recognition of ${r.earnedYears}y is not fully covered by verified time.`,
    );
  }
}

expect(
  RECOGNITION_THRESHOLD_YEARS.join(",") === "1,3,5,10,15,20",
  `Recognition ladder changed unexpectedly: ${RECOGNITION_THRESHOLD_YEARS.join(",")}.`,
);

// ---------------------------------------------------------------------------
// 7. Duration formatting never over-states
// ---------------------------------------------------------------------------
{
  const d = toDuration(5 * DAYS_PER_YEAR - 1);
  expect(
    d.years === 4,
    `One day short of five years must format as 4 years, got ${d.years}y${d.months}m.`,
  );
}

// ---------------------------------------------------------------------------
// 8. Disclosure packages: mandatory context always present
// ---------------------------------------------------------------------------
for (const pkg of DISCLOSURE_PACKAGES) {
  expect(
    pkg.items.some((i) => i.kind === "identity" && i.isMandatory),
    `${pkg.id}: identity must be a mandatory item — a credential detached from who it belongs to is not evidence.`,
  );
  expect(pkg.items.length > 0, `${pkg.id}: package must contain at least one item.`);
  expect(pkg.versionNo >= 1, `${pkg.id}: package must carry a version.`);
}

// ---------------------------------------------------------------------------
// 9. A payload never exceeds its contract, and mandatory items survive
// ---------------------------------------------------------------------------
for (const pkg of DISCLOSURE_PACKAGES) {
  for (const persona of PERSONAS) {
    // The adversarial case: the holder asks for nothing optional AND tries
    // to pass an item kind the package never offered.
    const payload = buildDisclosurePayload(
      persona,
      {
        packageId: pkg.id,
        optionalIncluded: ["contact", "totals", "recognition", "all_periods", "licences"],
        recipientHint: null,
        expiresOn: "2026-12-31",
        revoked: false,
      },
      EVAL,
    );

    const offered = new Set(pkg.items.map((i) => i.kind));
    for (const kind of payload.includedKinds) {
      expect(
        offered.has(kind),
        `${pkg.id}/${persona.id}: payload contains "${kind}", which the package never offers.`,
      );
    }

    for (const item of pkg.items.filter((i) => i.isMandatory)) {
      expect(
        payload.includedKinds.includes(item.kind),
        `${pkg.id}/${persona.id}: mandatory item "${item.kind}" is missing from the payload.`,
      );
    }

    expect(
      payload.packageVersionNo === pkg.versionNo,
      `${pkg.id}: payload must pin the package version.`,
    );
  }
}

// A holder cannot drop a mandatory item by omitting it.
{
  const pkg = packageById("licence");
  const payload = buildDisclosurePayload(
    personaById("expired-licence"),
    {
      packageId: "licence",
      optionalIncluded: [],
      recipientHint: null,
      expiresOn: "2026-12-31",
      revoked: false,
    },
    EVAL,
  );
  for (const item of pkg.items.filter((i) => i.isMandatory)) {
    expect(
      payload.includedKinds.includes(item.kind),
      `Mandatory item "${item.kind}" must be present even when the holder selects nothing.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 10. Disclosed claims keep their full context
// ---------------------------------------------------------------------------
{
  const payload = buildDisclosurePayload(
    personaById("expired-licence"),
    {
      packageId: "licence",
      optionalIncluded: [],
      recipientHint: null,
      expiresOn: "2026-12-31",
      revoked: false,
    },
    EVAL,
  );
  const claimSections = payload.sections.filter((s) => s.kind === "claims");
  const disclosed = claimSections.flatMap((s) => (s.kind === "claims" ? s.claims : []));
  expect(disclosed.length > 0, "The licence package must disclose at least one claim.");
  for (const c of disclosed) {
    expect(Boolean(c.assertionLevel), `${c.id}: assertion level must travel with the claim.`);
    expect(Boolean(c.lifecycleState), `${c.id}: lifecycle state must travel with the claim.`);
    expect(Boolean(c.issuerName), `${c.id}: issuer must travel with the claim.`);
    expect(
      c.jurisdictionCode !== null,
      `${c.id}: a licence must carry its jurisdiction into a disclosure.`,
    );
    expect(
      c.limitationSv !== null && c.limitationEn !== null,
      `${c.id}: the explanatory limitation must travel with the claim, in both languages.`,
    );
  }
}

// The "verified" package must never leak an unverified period.
{
  const payload = buildDisclosurePayload(
    personaById("mixed-evidence"),
    {
      packageId: "verified",
      optionalIncluded: [],
      recipientHint: null,
      expiresOn: "2026-12-31",
      revoked: false,
    },
    EVAL,
  );
  for (const s of payload.sections) {
    if (s.kind !== "periods") continue;
    for (const p of s.periods) {
      expect(
        p.assertionLevel === "verified",
        `Verified Experience package leaked a ${p.assertionLevel} period (${p.id}).`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 11. Share status is derived, never asserted
// ---------------------------------------------------------------------------
{
  const byId = Object.fromEntries(DISCLOSURE_FIXTURES.map((f) => [f.id, f]));
  expect(
    shareStatus(byId.valid.request, EVAL) === "active",
    "The 'valid' disclosure fixture must resolve to active.",
  );
  expect(
    shareStatus(byId.expired.request, EVAL) === "expired",
    "The 'expired' disclosure fixture must resolve to expired.",
  );
  expect(
    shareStatus(byId.revoked.request, EVAL) === "revoked",
    "The 'revoked' disclosure fixture must resolve to revoked.",
  );
  // Revocation wins over a future expiry date.
  expect(
    shareStatus({ ...byId.valid.request, revoked: true }, EVAL) === "revoked",
    "Revocation must take precedence over an unexpired date.",
  );
}

// ---------------------------------------------------------------------------
// 12. Passport Card is derived and locked
// ---------------------------------------------------------------------------
{
  const empty = buildPassportCard(personaById("career-discovery-only"), EVAL);
  expect(empty.state === "empty", `Expected an empty card state, got ${empty.state}.`);

  const selfOnly = buildPassportCard(personaById("new-vaktare"), EVAL);
  expect(
    selfOnly.state === "self_declared_only",
    `A holder with no verified entry must yield self_declared_only, got ${selfOnly.state}.`,
  );

  const expired = buildPassportCard(personaById("expired-licence"), EVAL);
  expect(
    expired.containsExpired,
    "The expired-licence persona's card must report expired content.",
  );

  const disputed = buildPassportCard(personaById("disputed-claim"), EVAL);
  expect(disputed.containsDisputed, "The disputed persona's card must report disputed content.");

  for (const persona of PERSONAS) {
    const card = buildPassportCard(persona, EVAL);
    expect(
      card.credentials.length <= 3,
      `${persona.id}: the card must show at most three credentials, got ${card.credentials.length}.`,
    );
    if (card.recognition.earnedYears !== null) {
      const t = totalsByEvidenceLevel(persona.periods, EVAL);
      expect(
        t.verified.elapsedDays >= card.recognition.earnedYears * DAYS_PER_YEAR,
        `${persona.id}: the card shows a recognition unsupported by verified time.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 13. Fixtures are fictional and cover every required state
// ---------------------------------------------------------------------------
{
  const FICTIONAL_SURNAMES = ["Testsson", "Exempelsson", "Provsson", "Fiktivsson"];
  for (const persona of PERSONAS) {
    expect(
      FICTIONAL_SURNAMES.some((s) => persona.displayName.includes(s)),
      `${persona.id}: fixture names must be transparently fictional (got "${persona.displayName}").`,
    );
  }

  const REQUIRED_PERSONAS = [
    "career-discovery-only",
    "passport-only",
    "new-vaktare",
    "overlapping-employers",
    "part-time",
    "career-break",
    "mixed-evidence",
    "five-verified-years",
    "expired-licence",
    "disputed-claim",
  ];
  for (const id of REQUIRED_PERSONAS) {
    expect(
      PERSONAS.some((p) => p.id === id),
      `Required fixture persona "${id}" is missing.`,
    );
  }

  // Every assertion level and every lifecycle state that Phase 1 must show
  // has to appear somewhere, or a reviewer cannot see it.
  const seenAssertion = new Set<string>();
  const seenLifecycle = new Set<string>();
  for (const p of PERSONAS) {
    for (const c of p.claims) {
      seenAssertion.add(c.assertionLevel);
      seenLifecycle.add(c.lifecycleState);
    }
    for (const e of p.periods) {
      seenAssertion.add(e.assertionLevel);
      seenLifecycle.add(e.lifecycleState);
    }
  }
  for (const level of ASSERTION_LEVELS) {
    expect(seenAssertion.has(level), `No fixture demonstrates assertion level "${level}".`);
  }
  for (const state of ["active", "expired", "disputed"] as const) {
    expect(seenLifecycle.has(state), `No fixture demonstrates lifecycle state "${state}".`);
  }
  expect(
    LIFECYCLE_STATES.length === 6,
    `Lifecycle states changed unexpectedly (${LIFECYCLE_STATES.length}).`,
  );

  // Requirement 12: valid, expired and revoked recipient states.
  for (const id of ["valid", "expired", "revoked"]) {
    expect(
      DISCLOSURE_FIXTURES.some((f) => f.id === id),
      `Required disclosure fixture "${id}" is missing.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 14. Swedish/English copy parity
// ---------------------------------------------------------------------------
{
  const svKeys = Object.keys(passportCopy.sv) as PassportCopyKey[];
  const enKeys = Object.keys(passportCopy.en) as PassportCopyKey[];

  for (const key of svKeys) {
    expect(enKeys.includes(key), `i18n: key "${key}" exists in sv but not in en.`);
  }
  for (const key of enKeys) {
    expect(svKeys.includes(key), `i18n: key "${key}" exists in en but not in sv.`);
  }
  expect(
    svKeys.length === enKeys.length,
    `i18n: key counts differ (sv ${svKeys.length}, en ${enKeys.length}).`,
  );

  for (const key of svKeys) {
    expect(passportCopy.sv[key].trim().length > 0, `i18n: sv "${key}" is empty.`);
    expect(passportCopy.en[key].trim().length > 0, `i18n: en "${key}" is empty.`);
  }

  // The three evidence levels must be spelled out as words in both
  // languages — the rule that colour is never the sole differentiator
  // depends on the word existing at all.
  for (const level of ASSERTION_LEVELS) {
    const k = `assertion.${level}` as PassportCopyKey;
    expect(
      passportCopy.sv[k].length > 3 && passportCopy.en[k].length > 3,
      `i18n: assertion level "${level}" must be spelled out in both languages.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 15. Phase 1B — the social card carries only the safe subset
// ---------------------------------------------------------------------------
{
  const ANON = "Verifierad väktare";

  for (const persona of PERSONAS) {
    for (const mode of ["full_name", "initials", "anonymous"] as const) {
      const social = buildSocialCard(persona, EVAL, {
        privacyMode: mode,
        anonymousLabel: ANON,
      });
      const serialized = JSON.stringify(social);

      // (a) No forbidden FIELD may appear, under any privacy mode.
      for (const key of SOCIAL_FORBIDDEN_KEYS) {
        expect(
          !serialized.includes(`"${key}"`),
          `${persona.id}/${mode}: social card exposes forbidden field "${key}".`,
        );
      }

      // (b) No employer, issuer or date VALUE may leak, even under another
      //     field name.
      //
      //     Profession and jurisdiction are APPROVED social content, and for
      //     a Väktare the role title is literally the profession name — so a
      //     naive value scan flags "Väktare" as a leak when it is the field
      //     the card is supposed to show. Approved values are therefore
      //     excluded here; the field-level assertion in (a) is what stops
      //     `roleTitle` itself from ever being carried.
      const approved = new Set<string>([
        persona.professionTitleSv,
        persona.professionTitleEn,
        persona.jurisdictionCode,
      ]);
      const sensitiveValues = new Set<string>();
      for (const p of persona.periods) {
        sensitiveValues.add(p.employerName);
        sensitiveValues.add(p.roleTitle);
        sensitiveValues.add(p.startedOn);
        if (p.endedOn) sensitiveValues.add(p.endedOn);
        if (p.verifierName) sensitiveValues.add(p.verifierName);
      }
      for (const c of persona.claims) {
        sensitiveValues.add(c.issuerName);
        if (c.verifierName) sensitiveValues.add(c.verifierName);
        if (c.issuedOn) sensitiveValues.add(c.issuedOn);
        if (c.validUntil) sensitiveValues.add(c.validUntil);
      }
      for (const value of sensitiveValues) {
        if (!value || value === "—" || approved.has(value)) continue;
        expect(!serialized.includes(value), `${persona.id}/${mode}: social card leaks "${value}".`);
      }

      // (c) An expired or disputed credential is never published: a cached
      //     image cannot carry the qualification that makes it honest.
      const publishedIds = social.verifiedCredentials.map((c) => c.id);
      for (const id of publishedIds) {
        const claim = persona.claims.find((c) => c.id === id);
        expect(
          claim !== undefined &&
            claim.assertionLevel === "verified" &&
            claim.lifecycleState === "active",
          `${persona.id}/${mode}: social card published a non-active-verified credential (${id}).`,
        );
      }

      // (d) The milestone is verified-only and matches the Passport Card.
      const cardModel = buildPassportCard(persona, EVAL);
      expect(
        social.milestoneYears === cardModel.recognition.earnedYears,
        `${persona.id}/${mode}: social milestone disagrees with the Passport Card.`,
      );

      // (e) The verify destination must not embed the holder's id.
      expect(
        !social.verifyUrl.includes(persona.id),
        `${persona.id}/${mode}: verification URL embeds an internal identifier.`,
      );

      // (f) Privacy modes actually differ.
      if (mode === "anonymous") {
        expect(
          social.holderLabel === ANON,
          `${persona.id}: anonymous mode must not use the display name.`,
        );
      }
      if (mode === "initials") {
        expect(
          !social.holderLabel.includes(persona.displayName.split(" ")[1] ?? "@@"),
          `${persona.id}: initials mode must not contain the surname.`,
        );
      }

      expect(
        social.verifiedCredentials.length <= 3,
        `${persona.id}/${mode}: social card names more than three credentials.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 16. Phase 1B — no rating vocabulary anywhere in the design layer
// ---------------------------------------------------------------------------
{
  // The visual system must not offer a primitive that could express a
  // score. Checked against the token module's own exports rather than by
  // reading components, so a new direction cannot introduce one quietly.
  const forbidden = ["rating", "score", "rank", "percent", "grade", "level"];
  const tokenNames = Object.keys(TRUST_PALETTE).map((k) => k.toLowerCase());
  for (const name of tokenNames) {
    for (const bad of forbidden) {
      expect(
        !name.includes(bad),
        `Trust palette exposes a token named "${name}" — rating vocabulary is prohibited.`,
      );
    }
  }

  // Milestone styling must depend ONLY on verified years, and every band
  // must be reachable from a real threshold.
  const bands = new Set(RECOGNITION_THRESHOLD_YEARS.map((y) => milestoneStyle(y).tier));
  expect(bands.size >= 2, "Milestone styling must distinguish at least two year bands.");
  expect(
    milestoneStyle(null).tier === milestoneStyle(1).tier,
    "No recognition and the lowest band must not be styled as different achievements.",
  );

  // Text tones must clear WCAG AA against every card ground. The cards are
  // dark and the smallest type on them is the issuer line and the
  // verification URL — exactly the text a recipient needs, and exactly what
  // a designer is tempted to fade. Asserted rather than reviewed by eye.
  const relLum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (fg: string, bg: string): number => {
    const a = relLum(fg);
    const b = relLum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  const CARD_GROUNDS = [TRUST_PALETTE.navyDeep, TRUST_PALETTE.navy, TRUST_PALETTE.navyRaised];
  const TEXT_TONES: readonly [string, string][] = [
    ["ink", TRUST_PALETTE.ink],
    ["inkMuted", TRUST_PALETTE.inkMuted],
    ["inkFaint", TRUST_PALETTE.inkFaint],
    ["goldBright", TRUST_PALETTE.goldBright],
  ];
  for (const [name, tone] of TEXT_TONES) {
    for (const ground of CARD_GROUNDS) {
      const ratio = contrast(tone, ground);
      expect(
        ratio >= 4.5,
        `Contrast: ${name} (${tone}) on ${ground} is ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1.`,
      );
    }
  }

  // Every share format must be a real, positive pixel size.
  for (const f of SHARE_FORMATS) {
    expect(f.width > 0 && f.height > 0, `Share format ${f.id} has no dimensions.`);
    expect(
      typeof passportCopy.sv[f.labelKey as PassportCopyKey] === "string",
      `Share format ${f.id} has no Swedish label.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 17. Phase 7 — credential symbols and credential fixtures
// ---------------------------------------------------------------------------
{
  // Every required credential state has a persona a reviewer can select.
  const REQUIRED_CREDENTIAL_PERSONAS = [
    "cred-vu1-draft",
    "cred-vu1-documented",
    "cred-vu1-approved",
    "cred-vu1-vu2",
    "cred-vu2-ov-self",
    "cred-ov-documented",
    "cred-ov-current",
    "cred-ov-expired",
    "cred-sv-current",
    "cred-sv-disputed",
    "cred-corrected",
  ];
  for (const id of REQUIRED_CREDENTIAL_PERSONAS) {
    expect(
      PERSONAS.some((p) => p.id === id),
      `Required credential fixture persona "${id}" is missing.`,
    );
  }

  // The corrected persona must really carry a superseded version and a
  // current one that points back at it.
  const corrected = PERSONAS.find((p) => p.id === "cred-corrected");
  if (corrected) {
    const v1 = corrected.claims.find((c) => c.lifecycleState === "superseded");
    const v2 = corrected.claims.find((c) => c.lifecycleState === "active");
    expect(Boolean(v1 && v2), "cred-corrected must hold both versions.");
    expect(
      Boolean(v1 && v2 && v2.supersedesClaimId === v1.id && v2.versionNo > v1.versionNo),
      "The current version must supersede the old one with a higher version number.",
    );
  }

  // The presentation derivation: lifecycle qualifications always beat
  // evidence level, and only VERIFIED+ACTIVE is ever "approved".
  expect(
    credentialPresentation("verified", "active") === "verified",
    "verified+active must present as verified.",
  );
  expect(
    credentialPresentation("verified", "expired") === "expired",
    "An expired verified credential must NOT present as approved.",
  );
  expect(
    credentialPresentation("verified", "revoked") === "revoked",
    "A revoked verified credential must present as revoked.",
  );
  expect(
    credentialPresentation("document_provided", "active") === "documented",
    "document_provided+active must present as documented.",
  );
  expect(
    credentialPresentation("self_declared", "disputed") === "disputed",
    "A disputed credential must present as disputed.",
  );

  // Only approved receives the doubled gold rim; revoked is the only state
  // with the void strike; every non-active state carries a drawn glyph, so
  // colour is never the sole channel.
  for (const state of CREDENTIAL_PRESENTATION_STATES) {
    const t = symbolTreatment(state);
    expect(
      t.doubleRim === (state === "verified"),
      `Symbol treatment: doubled rim must be exclusive to approved (violated by ${state}).`,
    );
    expect(
      t.strike === (state === "revoked"),
      `Symbol treatment: the void strike must be exclusive to revoked (violated by ${state}).`,
    );
    if (
      ["documented", "approved", "expired", "revoked", "superseded", "disputed"].includes(state)
    ) {
      expect(t.glyph !== null, `Symbol treatment: ${state} must carry a status glyph.`);
    }
  }

  // The markup is self-contained: no external reference can appear in an
  // exported PNG, and every mark carries its label text.
  for (const code of SYMBOL_CODES) {
    for (const state of CREDENTIAL_PRESENTATION_STATES) {
      const svg = credentialSymbolMarkup(code, state);
      expect(svg.length > 0, `Symbol markup empty for ${code}/${state}.`);
      expect(
        !svg.includes("http") && !svg.includes("<image"),
        `Symbol markup for ${code}/${state} must be self-contained.`,
      );
      expect(
        svg.includes(`>${code}</text>`),
        `Symbol markup for ${code}/${state} must carry its label.`,
      );
    }
  }

  // ── Expiry is DERIVED everywhere, never read from the stored row ──────
  //
  // Nothing writes `expired` on the day a licence lapses. A card or a social
  // image built from the stored state would therefore print a lapsed
  // authorisation as currently VERIFIED — on the two artifacts that get
  // screenshotted and cached. This persona is stored `active` with a
  // `validUntil` in the past, so it fails every check that trusts the row.
  {
    const lapsed = personaById("cred-ov-lapsed-silently");
    const stored = lapsed.claims[0];
    expect(
      stored.lifecycleState === "active" && stored.validUntil !== null,
      "The lapsed persona must be STORED active, or it does not exercise the bug.",
    );
    expect(
      stored.validUntil !== null && stored.validUntil < EVAL,
      "The lapsed persona's validity must have ended before the evaluation date.",
    );

    const card = buildPassportCard(lapsed, EVAL);
    expect(
      card.credentials[0].lifecycleState === "expired",
      `A lapsed credential must reach the card as expired, got ${card.credentials[0].lifecycleState}.`,
    );
    expect(card.credentials[0].lapsed, "The card must mark the credential as lapsed by date.");
    expect(
      card.containsExpired,
      "A card holding a lapsed credential must report that it contains expired content.",
    );
    expect(
      credentialPresentation("verified", card.credentials[0].lifecycleState) === "expired",
      "A lapsed credential must never take the approved symbol treatment.",
    );

    const social = buildSocialCard(lapsed, EVAL, {
      privacyMode: "full_name",
      anonymousLabel: "Verifierad väktare",
    });
    expect(
      social.verifiedCredentials.length === 0,
      "A lapsed credential must never be published to a social image.",
    );
  }

  // The social card now carries the taxonomy code — and still only for
  // verified, active credentials (asserted per-claim in section 15c).
  const ovCurrent = PERSONAS.find((p) => p.id === "cred-ov-current");
  if (ovCurrent) {
    const social = buildSocialCard(ovCurrent, EVAL, {
      privacyMode: "full_name",
      anonymousLabel: "Verifierad väktare",
    });
    expect(
      social.verifiedCredentials.some((c) => c.code === "OV"),
      "The social card must carry the OV code for a current verified appointment.",
    );
  }
  const ovExpired = PERSONAS.find((p) => p.id === "cred-ov-expired");
  if (ovExpired) {
    const social = buildSocialCard(ovExpired, EVAL, {
      privacyMode: "full_name",
      anonymousLabel: "Verifierad väktare",
    });
    expect(
      !social.verifiedCredentials.some((c) => c.code === "OV"),
      "An expired OV must never be published on a social card.",
    );
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`passport-fixture:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const svKeyCount = Object.keys(passportCopy.sv).length;
console.log(
  `passport-fixture:check OK ` +
    `(${PERSONAS.length} fictional personas; interval union proven against naive sum; ` +
    `disputed/part-time/partial handled; three totals nested; recognitions VERIFIED-only; ` +
    `${DISCLOSURE_PACKAGES.length} packages with mandatory context enforced across ` +
    `${DISCLOSURE_PACKAGES.length * PERSONAS.length} payload builds; ` +
    `card derived and capped at 3 credentials; ${svKeyCount} copy keys at sv/en parity; ` +
    `social card safe across ${PERSONAS.length * 3} persona/privacy combinations ` +
    `(no forbidden field, no employer/issuer/date leak, verified-active only); ` +
    `${SHARE_FORMATS.length} share formats; no rating vocabulary in the design layer)`,
);
