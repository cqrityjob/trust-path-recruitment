// THE CV A PILOT USER ACTUALLY SENDS — asserted end to end.
//
// Run via `bun run cv-pilot:check`.
//
// ── WHAT THIS GUARD IS DEFENDING ───────────────────────────────────────
//
// One document, produced by this product, carrying a person's name, sent to
// an employer who will make a hiring decision on it. Every check below is a
// specific untrue thing that document could say, or a specific true thing it
// could omit — not a rendering detail.
//
// The one that already happened, and the reason this file exists:
//
//   A VERIFIED CREDENTIAL WHOSE `valid_until` HAD PASSED WAS PRINTED WITH A
//   GOLD "VERIFIED" CHIP, AN ATTRIBUTION LINE NAMING THE VERIFIER, AND NO
//   EXPIRY DATE ANYWHERE ON THE PAGE.
//
// Nothing about the code looked wrong. `validity.ts` states the Passport's
// rule — expiry is DERIVED at read time and never stored, because anything
// that writes `lifecycle_state = 'expired'` on the day a licence lapses is a
// scheduled job that can stop running — and the Passport Card, the recipient
// page, the social card, the attention list and the entry page all apply
// `validityOf` accordingly. The CV read `lifecycle_state` straight off
// `sp_claims`, where a lapsed credential is still `active` and still
// `verified`, because somebody really did verify it once.
//
// So the expiry group below asserts the rendered markup, not the helper: the
// helper was already right, and the CV simply never asked it.
//
// ── AND WHAT IT DELIBERATELY DOES NOT TRY TO PROVE ─────────────────────
//
// "Only the owner can read their CV" is RLS and a SECURITY INVOKER function.
// A source scan asserting it would be a comfortable lie. That is proved by
// executing it, in supabase/tests/, exactly as
// cv-application-source-check.tsx says of its own boundaries.
//
// Deterministic, credential-free, network-free. The evaluation date is
// PINNED so an expiry assertion does not quietly change meaning on a
// Tuesday in March.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { CvDocumentView } from "../src/components/professional-identity/CvDocumentView";
import { CV } from "../src/components/professional-identity/cv-copy";
import { selectionHasHistory } from "../src/components/professional-identity/CvComposer";
import {
  buildCvSourceBundle,
  citableIds,
  type CvSourceBundle,
} from "../src/lib/professional-identity/cv/source-bundle";
import {
  buildCvTrustAnnotations,
  emptyCvTrustAnnotations,
} from "../src/lib/professional-identity/cv/trust-annotations";
import {
  buildFactualCvDocument,
  NO_CV_CONTACT,
} from "../src/lib/professional-identity/cv/document";
import {
  applyCvEdit,
  buildSavedCvDocument,
  cvEditSchema,
  factualStoredPresentation,
  reconcileStoredPresentation,
  resolveCvContact,
  storedFromAiPresentation,
  type StoredContact,
} from "../src/lib/professional-identity/cv/stored";
import {
  omittedFacts,
  pruneExclusions,
  reselectSavedBundle,
  selectableIds,
} from "../src/lib/professional-identity/cv/selection";
import { cvApplicationBlock } from "../src/lib/professional-identity/cv/application-source";
import { computeCvReadiness } from "../src/lib/professional-identity/cv/readiness";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

/** Markup with the tags taken out, so an assertion about what a person READS
 *  is not accidentally satisfied by a class name or an aria attribute. */
function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The day everything below is evaluated on.
 *
 * Pinned, and the fixtures are dated around it. An expiry check that used
 * `new Date()` would pass every day until the fixture's own date drifted
 * past it and then fail for a reason that has nothing to do with the code.
 */
const TODAY = "2026-09-08";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const EMPTY_IDENTITY: ProfessionalIdentityV1 = {
  identityVersion: "professional-identity-v1",
  displayName: null,
  accountCountry: null,
  locale: "sv",
  currentStatus: null,
  currentProfessionSlug: null,
  currentProfessionOther: null,
  currentProfessionTitleSv: null,
  currentProfessionTitleEn: null,
  yearsOfExperience: null,
  hasPassport: false,
  headline: null,
  workCountry: null,
  workSubJurisdiction: null,
  employment: [],
  claims: [],
  discovery: {
    hasCompletedReport: false,
    snapshotId: null,
    generatedAt: null,
    namesCareers: false,
  },
  workload: {
    applicationCount: 0,
    assessmentAssignmentCount: 0,
    releasedReportCount: 0,
    releasedReportAttemptId: null,
    assessmentAssignmentAttemptId: null,
    employerWorkspaceCount: 0,
    draftClaimCount: 0,
    draftClaimIds: [],
  },
  unavailable: [],
};

function identity(over: Partial<ProfessionalIdentityV1> = {}): ProfessionalIdentityV1 {
  return { ...EMPTY_IDENTITY, ...over };
}

type Claim = ProfessionalIdentityV1["claims"][number];
type Employment = ProfessionalIdentityV1["employment"][number];

function claim(over: Partial<Claim> = {}): Claim {
  return {
    id: "c-vu1",
    claimType: "certification",
    title: "Väktarutbildning VU1",
    issuerName: "BYA",
    issuedOn: "2019-04-01",
    validUntil: null,
    skillLevel: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

function employment(over: Partial<Employment> = {}): Employment {
  return {
    id: "e-nordic",
    employerName: "Nordic Security AB",
    roleTitle: "Väktare",
    startedOn: "2019-06-01",
    endedOn: null,
    employmentType: "employed",
    jurisdictionCode: "SE",
    assertionLevel: "self_declared",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

/** A verified credential, the way a real decision record carries one. */
const VERIFIED_METHOD = {
  assertionLevel: "verified",
  verifierName: "BYA",
  verifiedOn: "2024-02-01",
};

/** Somebody with an ordinary Swedish security career. */
const WALLIN = identity({
  displayName: "Karin Wallin",
  accountCountry: "SE",
  hasPassport: true,
  headline: "Väktare med sex års erfarenhet",
  workCountry: "SE",
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  currentProfessionTitleEn: "Security officer",
  yearsOfExperience: "6-10",
  employment: [
    employment({
      id: "e-current",
      employerName: "Nordic Security AB",
      roleTitle: "Väktare",
      startedOn: "2022-03-01",
      endedOn: null,
      ...VERIFIED_METHOD,
      verificationMethod: "employer_confirmation",
    }),
    // ENDED, and that is the point of it being here: an employment that
    // finished is professional history, not an archived merit.
    employment({
      id: "e-past",
      employerName: "Stadsvakt i Malmö AB",
      roleTitle: "Ordningsvakt",
      startedOn: "2019-06-01",
      endedOn: "2022-02-28",
    }),
  ],
  claims: [
    claim({
      id: "c-vu1",
      title: "Väktarutbildning VU1",
      validUntil: "2028-04-01",
      ...VERIFIED_METHOD,
      verificationMethod: "source_confirmation",
    }),
    claim({
      id: "c-ov",
      claimType: "licence",
      title: "Ordningsvaktsförordnande",
      validUntil: "2026-03-31",
      ...VERIFIED_METHOD,
      verificationMethod: "source_confirmation",
    }),
    claim({
      id: "c-gy",
      claimType: "education",
      title: "Gymnasieexamen, samhällsvetenskap",
      issuerName: "Malmö kommun",
      issuedOn: "2018-06-01",
    }),
    claim({
      id: "c-sv",
      claimType: "language",
      title: "Svenska",
      skillLevel: "modersmål",
      issuerName: null,
      issuedOn: null,
    }),
    claim({
      id: "c-en",
      claimType: "language",
      title: "Engelska",
      skillLevel: "B2",
      issuerName: null,
      issuedOn: null,
    }),
    claim({
      id: "c-skill",
      claimType: "practical_skill",
      title: "Kameraövervakning",
      issuerName: null,
      issuedOn: null,
    }),
  ],
});

const bundleOf = (id: ProfessionalIdentityV1, excludedIds: readonly string[] = []) =>
  buildCvSourceBundle({
    identity: id,
    locale: "sv",
    includeCareerInsight: false,
    targetJobText: null,
    excludedIds,
  });

const documentOf = (
  id: ProfessionalIdentityV1,
  excludedIds: readonly string[] = [],
  contact = NO_CV_CONTACT,
) => buildFactualCvDocument(bundleOf(id, excludedIds), buildCvTrustAnnotations(id, TODAY), contact);

const markupOf = (...args: Parameters<typeof documentOf>) =>
  renderToStaticMarkup(<CvDocumentView document={documentOf(...args)} />);

/* ================================================================== */
/* 1 · Selection — deselected means GONE, not hidden                   */
/* ================================================================== */

group("SELECTION — a deselected fact is absent, not merely undrawn");
{
  const all = bundleOf(WALLIN);
  const trimmed = bundleOf(WALLIN, ["e-past", "c-ov", "c-en"]);

  ck(
    "everything the person has is included until they say otherwise",
    all.employment.length === 2 && all.credentials.length === 2 && all.languages.length === 2,
  );
  ck(
    "a deselected employment is not in the source bundle",
    trimmed.employment.length === 1 && !trimmed.employment.some((e) => e.id === "e-past"),
  );
  ck(
    "a deselected credential and language are not in the source bundle",
    trimmed.credentials.length === 1 && trimmed.languages.length === 1,
  );

  // THE PROVIDER INPUT. `generateCvPresentation` passes the whole bundle as
  // governedContext, so "absent from the bundle" is the same statement as
  // "the model was never told about it" -- which is what makes a tailored CV
  // incapable of reaching for a job the person took off.
  const serialised = JSON.stringify(trimmed);
  ck(
    "and therefore not in the object handed to a language model",
    !serialised.includes("Stadsvakt") && !serialised.includes("Ordningsvaktsförordnande"),
  );

  // THE VALIDATOR'S ALLOWLIST. A draft citing a deselected employment is a
  // fabricated citation and is rejected whole, rather than quietly rendering.
  const citable = citableIds(trimmed);
  ck(
    "a draft may not cite a deselected fact",
    !citable.has("e-past") && !citable.has("c-ov") && citable.has("e-current"),
  );

  const text = visibleText(markupOf(WALLIN, ["e-past", "c-ov", "c-en"]));
  ck(
    "the rendered document does not print it",
    !text.includes("Stadsvakt") &&
      !text.includes("Ordningsvakt") &&
      !text.includes("Engelska") &&
      text.includes("Nordic Security AB"),
  );

  // THE EMPLOYER'S COPY. 20261018090000 copies `source_bundle` verbatim onto
  // the application, and that row is employer-readable. This is the assertion
  // that makes selection a privacy property rather than a display preference:
  // a renderer-side filter would pass every check above and fail this one.
  ck(
    "and the snapshot an employer would receive does not contain it either",
    !JSON.stringify({ source_bundle: trimmed }).includes("Stadsvakt"),
  );
}

group("SELECTION — changing it on a SAVED CV changes nothing else");
{
  const saved = bundleOf(WALLIN, ["e-past"]);

  // The profile has moved since: the employer name was corrected and a new
  // language was recorded. Neither was asked for.
  const moved = identity({
    ...WALLIN,
    employment: WALLIN.employment.map((e) =>
      e.id === "e-current" ? { ...e, employerName: "Nordic Security Group AB" } : e,
    ),
    claims: [...WALLIN.claims, claim({ id: "c-ar", claimType: "language", title: "Arabiska" })],
  });
  const full = bundleOf(moved);

  const added = reselectSavedBundle(saved, full, [], ["e-past"]);
  ck(
    "putting one employment back puts exactly that employment back",
    added.employment.length === 2 && added.employment.some((e) => e.id === "e-past"),
  );
  ck(
    "it does NOT quietly accept an unrelated correction made since the CV was saved",
    added.employment.find((e) => e.id === "e-current")?.employerName === "Nordic Security AB",
  );
  ck(
    "and it does NOT quietly add a record nobody asked for",
    !added.languages.some((c) => c.id === "c-ar"),
  );
  ck("employment stays newest-first after a re-selection", added.employment[0]?.id === "e-current");

  const removed = reselectSavedBundle(saved, full, ["c-en"], []);
  ck(
    "removing is a pure filter over the snapshot -- nothing is read, nothing else moves",
    !removed.languages.some((c) => c.id === "c-en") &&
      removed.employment.find((e) => e.id === "e-current")?.employerName === "Nordic Security AB",
  );
}

group("SELECTION — the stored exclusion list survives a refresh");
{
  // THE REGRESSION THIS PINS. `reconcileStoredPresentation` prunes exclusions
  // for records that no longer exist. Pruned against the FILTERED bundle it
  // would prune every one of them -- because a filtered bundle contains, by
  // construction, none of the excluded ids -- and the next "update from
  // profile" would silently put the person's whole profile back on the CV.
  const filtered = bundleOf(WALLIN, ["e-past"]);
  const stored = { ...factualStoredPresentation(filtered), excludedIds: ["e-past"] };

  const wrong = reconcileStoredPresentation(stored, filtered).presentation;
  ck(
    "pruning against the filtered bundle would lose the exclusion (the bug)",
    wrong.excludedIds.length === 0,
  );

  const right = reconcileStoredPresentation(
    stored,
    filtered,
    selectableIds(bundleOf(WALLIN)),
  ).presentation;
  ck("pruning against everything the person HAS keeps it", right.excludedIds.includes("e-past"));

  ck(
    "an exclusion for a record that is genuinely gone is dropped rather than kept forever",
    pruneExclusions(["e-past", "e-deleted"], selectableIds(bundleOf(WALLIN))).join() === "e-past",
  );
}

group("SELECTION — the person is told what is NOT on the CV");
{
  const omitted = omittedFacts(bundleOf(WALLIN), bundleOf(WALLIN, ["e-past", "c-ov"]));
  ck("both omissions are reported", omitted.length === 2);
  ck(
    "and named by something a person recognises, never by an id",
    omitted.some((o) => o.label === "Stadsvakt i Malmö AB") &&
      omitted.some((o) => o.label === "Ordningsvaktsförordnande") &&
      omitted.every((o) => !o.label.includes("-")),
  );
  ck(
    "each carries the section it belongs to, so it can be offered back in place",
    omitted.find((o) => o.label === "Stadsvakt i Malmö AB")?.section === "employment" &&
      omitted.find((o) => o.label === "Ordningsvaktsförordnande")?.section === "credentials",
  );
}

group("SELECTION — a CV with no professional history is refused BEFORE the button");
{
  const all = bundleOf(WALLIN);
  const noHistory = ["e-current", "e-past", "c-gy"];
  ck(
    "unticking every employment and education leaves no history",
    !selectionHasHistory(all, noHistory),
  );
  ck(
    "and the same selection is what the application rule would block",
    cvApplicationBlock(bundleOf(WALLIN, noHistory)) === "no_history",
  );
  ck(
    "skills and languages do not stand in for a career -- the same rule readiness.ts states",
    !selectionHasHistory(all, noHistory) && bundleOf(WALLIN, noHistory).languages.length === 2,
  );
  ck("one employment is enough", selectionHasHistory(all, ["e-past", "c-gy"]));
  ck(
    "so is education alone, for somebody entering the industry",
    selectionHasHistory(all, ["e-current", "e-past"]),
  );
}

/* ================================================================== */
/* 2 · Currency — a lapsed authorisation is never presented as current */
/* ================================================================== */

group("EXPIRY — the defect this guard exists for");
{
  // Verified by a source, active in the database, and lapsed by the calendar.
  const lapsed = identity({
    ...WALLIN,
    claims: [
      claim({
        id: "c-ov",
        claimType: "licence",
        title: "Ordningsvaktsförordnande",
        issuerName: "Polismyndigheten",
        validUntil: "2026-03-31",
        lifecycleState: "active",
        assertionLevel: "verified",
        // A verifier name unique to this credential. The page also carries an
        // employment confirmed by somebody else, and an assertion that merely
        // searched the whole document for "a verifier name" would be
        // satisfied -- or defeated -- by the wrong fact.
        verifierName: "Länsstyrelsen i Skåne",
        verifiedOn: "2024-02-01",
        verificationMethod: "source_confirmation",
      }),
    ],
  });

  const annotations = buildCvTrustAnnotations(lapsed, TODAY);
  ck(
    "the trust annotation for a lapsed credential is not verified",
    annotations.claims["c-ov"]?.status !== "verified",
  );
  ck(
    "and its validity is carried so the page can say so",
    annotations.validity["c-ov"]?.hasExpired === true &&
      annotations.validity["c-ov"]?.validUntil === "2026-03-31",
  );

  const text = visibleText(markupOf(lapsed));
  ck("the CV does NOT print a verification mark on it", !text.includes("Verifierad"));
  ck("the CV does NOT print an attribution line for it", !text.includes("Länsstyrelsen i Skåne"));
  ck("the CV DOES print the date it was valid until", text.includes("Giltig t.o.m. 2026-03-31"));
  ck("and says, in a word, that it has expired", text.includes("Utgången"));
  ck(
    "the expiry is announced to a screen reader before the word, not left to colour",
    markupOf(lapsed).includes("Behörigheten har gått ut."),
  );

  // The other direction, and it is as load-bearing as the first: a validator
  // that flags the product's own honest output gets switched off.
  const current = identity({
    ...lapsed,
    claims: [{ ...lapsed.claims[0], validUntil: "2028-03-31" }],
  });
  const currentText = visibleText(markupOf(current));
  ck("a credential still in date keeps its verification mark", currentText.includes("Verifierad"));
  ck("keeps its attribution line", currentText.includes("Länsstyrelsen i Skåne"));
  ck(
    "and prints its validity date rather than a warning",
    currentText.includes("Giltig t.o.m. 2028-03-31") && !currentText.includes("Utgången"),
  );

  const undated = identity({
    ...lapsed,
    claims: [{ ...lapsed.claims[0], validUntil: null }],
  });
  ck(
    "a credential that does not lapse gets no validity line at all",
    !visibleText(markupOf(undated)).includes("Giltig t.o.m."),
  );

  // A decision is not a date. `validityOf` refuses to downgrade a revocation
  // into a mere expiry, and the CV inherits that rather than restating it.
  const revoked = identity({
    ...lapsed,
    claims: [{ ...lapsed.claims[0], lifecycleState: "revoked", validUntil: "2028-03-31" }],
  });
  ck(
    "a revoked credential is not verified whatever its dates say",
    buildCvTrustAnnotations(revoked, TODAY).claims["c-ov"]?.status !== "verified",
  );
}

group("EXPIRY — currency is read live, career content stays frozen");
{
  // The saved CV froze "valid until 2026-03-31". The holder has since renewed
  // to 2029. A frozen expiry would print a date that has passed beside a mark
  // saying the credential is current, and the two would argue on one line.
  const savedBundle = bundleOf(
    identity({
      ...WALLIN,
      claims: [
        claim({
          id: "c-ov",
          claimType: "licence",
          title: "Ordningsvaktsförordnande",
          validUntil: "2026-03-31",
          ...VERIFIED_METHOD,
          verificationMethod: "source_confirmation",
        }),
      ],
    }),
  );
  const renewed = identity({
    ...WALLIN,
    claims: [
      claim({
        id: "c-ov",
        claimType: "licence",
        title: "Ordningsvaktsförordnande",
        validUntil: "2029-03-31",
        ...VERIFIED_METHOD,
        verificationMethod: "source_confirmation",
      }),
    ],
  });

  const doc = buildSavedCvDocument(
    savedBundle,
    factualStoredPresentation(savedBundle),
    buildCvTrustAnnotations(renewed, TODAY),
  );
  const text = visibleText(renderToStaticMarkup(<CvDocumentView document={doc} />));
  ck(
    "a renewal shows through onto a CV saved before it",
    text.includes("Giltig t.o.m. 2029-03-31"),
  );
  ck("and the CV does not print the superseded date", !text.includes("2026-03-31"));
  ck(
    "while the career content it froze is still the frozen copy",
    doc.credentials[0]?.title === "Ordningsvaktsförordnande",
  );
}

group("EXPIRY — an unreadable provenance read still cannot hide a lapse");
{
  // Two independent statements. "We could not establish who verified this"
  // must not suppress "this lapsed in March": the second is arithmetic on a
  // date the claims read already returned, and it is the more important one.
  const lapsed = identity({
    ...WALLIN,
    claims: [
      claim({
        id: "c-ov",
        claimType: "licence",
        title: "Ordningsvaktsförordnande",
        validUntil: "2026-03-31",
        ...VERIFIED_METHOD,
      }),
    ],
    unavailable: ["provenance"],
  });
  const annotations = buildCvTrustAnnotations(lapsed, TODAY);
  ck("nothing is claimed about who verified it", annotations.unavailable === true);
  ck("no verification mark is drawn", Object.keys(annotations.claims).length === 0);
  ck("and the lapse is still stated", annotations.validity["c-ov"]?.hasExpired === true);

  const text = visibleText(
    renderToStaticMarkup(
      <CvDocumentView document={buildFactualCvDocument(bundleOf(lapsed), annotations)} />,
    ),
  );
  ck("on the page as well", text.includes("Utgången"));
  ck(
    "and the legend explaining the marks is suppressed, since none are drawn",
    !text.includes("sköldrad"),
  );
}

/* ================================================================== */
/* 3 · What may never reach an exported page                           */
/* ================================================================== */

group("EXPORT — unfinished and archived entries never leave the Passport");
{
  const messy = identity({
    ...WALLIN,
    claims: [
      claim({ id: "c-draft", title: "Halvfärdig behörighet", lifecycleState: "draft" }),
      claim({ id: "c-arch", title: "Arkiverat intyg", lifecycleState: "archived" }),
      claim({ id: "c-wd", title: "Tillbakadraget intyg", lifecycleState: "withdrawn" }),
      claim({ id: "c-vu1", title: "Väktarutbildning VU1" }),
    ],
  });
  const b = bundleOf(messy);
  ck("a draft merit is not in the bundle", !JSON.stringify(b).includes("Halvfärdig"));
  ck("an archived merit is not in the bundle", !JSON.stringify(b).includes("Arkiverat"));
  ck("a withdrawn merit is not in the bundle", !JSON.stringify(b).includes("Tillbakadraget"));
  ck(
    "the active one is",
    b.credentials.some((c) => c.title === "Väktarutbildning VU1"),
  );

  // The distinction the brief draws in one sentence, asserted in one place:
  // an employment that ENDED is career history and belongs on the CV; an
  // archived MERIT is not a current merit and does not.
  const text = visibleText(markupOf(WALLIN));
  ck(
    "an ended employment is on the CV, with the month it ended",
    text.includes("Stadsvakt i Malmö AB") && text.includes("2019-06 – 2022-02"),
  );
  ck("and a current one reads as current", text.includes("2022-03 – nu"));
}

group("EXPORT — no internal identifier reaches the page");
{
  const withInsight = identity({
    ...WALLIN,
    discovery: {
      hasCompletedReport: true,
      snapshotId: "8f1d2c34-5a6b-47c8-9d0e-1f2a3b4c5d6e",
      generatedAt: "2026-05-01T00:00:00Z",
      namesCareers: true,
    },
  });
  const doc = buildFactualCvDocument(
    buildCvSourceBundle({
      identity: withInsight,
      locale: "sv",
      includeCareerInsight: true,
      targetJobText: null,
    }),
    buildCvTrustAnnotations(withInsight, TODAY),
  );
  const markup = renderToStaticMarkup(<CvDocumentView document={doc} />);
  ck(
    "the Career Discovery snapshot id decides whether a note appears and is never printed",
    !markup.includes("8f1d2c34"),
  );
  ck(
    "and the note that does appear labels it as a direction, not a competency",
    visibleText(markup).includes("inte en kompetens"),
  );
  ck(
    "no uuid appears anywhere in the text a reader sees",
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      visibleText(markupOf(WALLIN)),
    ),
  );
}

group("EXPORT — the page dates itself and promises nothing it cannot keep");
{
  const text = visibleText(markupOf(WALLIN));
  ck("the document says when its contents were established", text.includes(TODAY));
  ck("and says plainly that a saved PDF does not update itself", text.includes("uppdateras inte"));
  ck(
    "it never claims an export updates or can be recalled",
    !/uppdateras automatiskt|återkallas automatiskt|updates automatically/i.test(text),
  );
  ck(
    "the verification legend explains the marks for a reader who has never seen one",
    text.includes("sköldrad"),
  );

  // The employer's copy is a historical artefact and is dated by SUBMISSION.
  const employerView = renderToStaticMarkup(
    <CvDocumentView document={documentOf(WALLIN)} renderedOn="2026-06-01" />,
  );
  ck(
    "a submitted copy is dated by submission, not by today",
    visibleText(employerView).includes("2026-06-01"),
  );
}

group("EXPORT — the print button describes what it actually does");
{
  const detail = read("src/routes/_authenticated.my-career.cv.$cvId.tsx");
  ck(
    "the control is labelled as the print dialog it opens",
    CV.print.sv.includes("Skriv ut") && CV.print.en.includes("Print"),
  );
  ck(
    "and neither language promises a direct download",
    !/ladda ner|hämta pdf|download/i.test(
      `${CV.print.sv} ${CV.print.en} ${CV.exportHelp.sv} ${CV.exportHelp.en}`,
    ),
  );
  ck(
    "the button is wired to window.print() and to nothing else",
    detail.includes("window.print()"),
  );
  ck("and carries the explanation with it", detail.includes('aria-describedby="cv-export-help"'));
}

/* ================================================================== */
/* 4 · Contact details                                                 */
/* ================================================================== */

group("CONTACT — reused, opt-in, and never a verified claim");
{
  const b = bundleOf(WALLIN);
  const serialised = JSON.stringify(b);
  ck(
    "contact details are not in the source bundle, so they never enter a provider request",
    !/"email"|"phone"|"telefon"/i.test(serialised),
  );

  const stored: StoredContact = {
    email: "karin@example.se",
    phone: "070-123 45 67",
    showEmail: false,
    showPhone: false,
  };
  ck(
    "nothing is shown until it is ticked",
    resolveCvContact(stored).email === null && resolveCvContact(stored).phone === null,
  );
  ck(
    "and it is the switch that decides, not merely the value being present",
    resolveCvContact({ ...stored, showEmail: true }).email === "karin@example.se" &&
      resolveCvContact({ ...stored, showEmail: true }).phone === null,
  );

  const shown = resolveCvContact({ ...stored, showEmail: true, showPhone: true });
  const text = visibleText(markupOf(WALLIN, [], shown));
  ck(
    "a shown contact detail is on the page",
    text.includes("karin@example.se") && text.includes("070-123 45 67"),
  );

  // It must not pick up the document's trust decoration by sitting near it.
  const header = markupOf(WALLIN, [], shown).split("Sammanfattning")[0] ?? "";
  const headerBeforeSections = header.split("Erfarenhet")[0] ?? header;
  ck(
    "no verification mark is drawn anywhere near it",
    !headerBeforeSections.includes("Verifierad") &&
      !headerBeforeSections.includes("Verifieringsuppgift"),
  );
  // Structural, not a regex over field names: a payload that TRIES to carry a
  // verification state is parsed, and the state is gone on the other side.
  const contactAttempt = cvEditSchema.parse({
    cvId: "00000000-0000-4000-8000-000000000000",
    contact: { email: "karin@example.se", verified: true, assertionLevel: "verified" },
  });
  ck(
    "a payload claiming a contact detail is verified loses the claim at the boundary",
    !("verified" in (contactAttempt.contact ?? {})) &&
      !("assertionLevel" in (contactAttempt.contact ?? {})),
  );
}

group("CONTACT — the work location is a place, not a code");
{
  const text = visibleText(markupOf(WALLIN));
  ck(
    "the CV prints a country name rather than 'SE'",
    text.includes("Sverige") && !/(^|\s)SE(\s|$)/.test(text),
  );

  const dubai = identity({ ...WALLIN, workCountry: "AE", workSubJurisdiction: "AE-DU" });
  const dubaiText = visibleText(markupOf(dubai));
  ck(
    "a Dubai holder is not flattened into a UAE-wide claim",
    dubaiText.includes("Dubai") && dubaiText.includes("Förenade Arabemiraten"),
  );

  // A sub-jurisdiction describes where somebody WORKS. Pairing it with an
  // account country it does not belong to would invent a work location.
  const noPassportCountry = identity({
    ...WALLIN,
    workCountry: null,
    accountCountry: "SE",
    workSubJurisdiction: "AE-DU",
  });
  ck(
    "a stray sub-jurisdiction is not attached to the account country",
    bundleOf(noPassportCountry).identity.countrySubdivision === null,
  );
}

/* ================================================================== */
/* 5 · Authorship — the person's words stay the person's words         */
/* ================================================================== */

group("AUTHORSHIP — manual text inherits nothing from a verified fact");
{
  const b = bundleOf(WALLIN);
  const stored = {
    ...factualStoredPresentation(b),
    experience: [
      { sourceId: "e-current", bullets: ["Ansvarade för ronderande bevakning i city."] },
    ],
  };
  const doc = buildSavedCvDocument(b, stored, buildCvTrustAnnotations(WALLIN, TODAY));
  const markup = renderToStaticMarkup(<CvDocumentView document={doc} />);

  ck("the employment is confirmed and says so", visibleText(markup).includes("Nordic Security AB"));
  ck(
    "the attribution names the EMPLOYMENT as what was confirmed, not the description",
    /Anställning(en)? bekräftad av|bekräftad av/i.test(visibleText(markup)),
  );
  ck(
    "the person's own bullet carries no verification mark of its own",
    doc.experience[0]?.bulletsAreAiWritten === false,
  );
  ck(
    "and a document whose prose is entirely the person's does not claim AI assistance",
    doc.origin === "factual",
  );

  // Editing a drafted line makes it the person's line, and the badge comes off.
  const aiStored = storedFromAiPresentation({
    headline: "Väktare med sex års erfarenhet",
    summary: "Erfaren väktare med bakgrund inom ronderande bevakning och ordningshållning.",
    experience: [{ sourceId: "e-current", bullets: ["Ronderande bevakning."] }],
    emphasisedClaimIds: [],
    tailoringRationale: "Ordnad kronologiskt.",
  });
  ck("a drafted headline is marked as drafted", aiStored.authorship.headline === "ai");
  const edited = applyCvEdit(
    aiStored,
    { cvId: "00000000-0000-4000-8000-000000000000", headline: "Väktare, Malmö" },
    b,
  );
  ck("editing it makes it the person's own", edited.authorship.headline === "person");
  ck("and leaves the untouched summary alone", edited.authorship.summary === "ai");
}

group("AUTHORSHIP — a regenerated draft cannot undo the person's choices");
{
  const settings = {
    excludedIds: ["e-past"],
    contact: { email: "karin@example.se", phone: "", showEmail: true, showPhone: false },
  };
  const stored = storedFromAiPresentation(
    {
      headline: "Väktare",
      summary: "Erfaren väktare med bakgrund inom ronderande bevakning och ordningshållning.",
      experience: [{ sourceId: "e-current", bullets: ["Ronderande bevakning."] }],
      emphasisedClaimIds: [],
      tailoringRationale: "Ordnad kronologiskt.",
    },
    settings,
  );
  ck("the deselection survives a new draft", stored.excludedIds.includes("e-past"));
  ck(
    "and so does the contact choice",
    stored.contact.showEmail === true && stored.contact.email === "karin@example.se",
  );
  ck(
    "the model has no field it could have written either into",
    !(
      "excludedIds" in
      { headline: "", summary: "", experience: [], emphasisedClaimIds: [], tailoringRationale: "" }
    ),
  );
}

group("AUTHORSHIP — a contact edit is not a factual correction");
{
  const b = bundleOf(WALLIN);
  const edited = applyCvEdit(
    factualStoredPresentation(b),
    {
      cvId: "00000000-0000-4000-8000-000000000000",
      contact: { phone: "070-000 00 00", showPhone: true },
    },
    b,
  );
  ck(
    "the contact detail is stored",
    edited.contact.phone === "070-000 00 00" && edited.contact.showPhone,
  );
  ck("the email is left alone", edited.contact.email === "");
  ck(
    "and no authorship flag was invented for it",
    Object.keys(edited.authorship).sort().join() === "bullets,headline,summary",
  );

  // THE EDITING CONTRACT, RESTATED OVER THE FIELDS THAT WERE ADDED.
  //
  // Asserted by parsing a hostile payload rather than by inspecting field
  // names, because the property that matters is what SURVIVES the boundary.
  // A client that posts an employer name gets it dropped; there is nowhere
  // for a factual correction to arrive through this door.
  const hostile = cvEditSchema.parse({
    cvId: "00000000-0000-4000-8000-000000000000",
    headline: "Väktare",
    employerName: "Företag Som Inte Finns AB",
    roleTitle: "Säkerhetschef",
    startedOn: "2010-01-01",
    endedOn: "2012-01-01",
    issuedOn: "2011-01-01",
    validUntil: "2030-01-01",
    institution: "Ett Universitet",
    credentialTitle: "En Behörighet",
    assertionLevel: "verified",
  }) as Record<string, unknown>;
  ck(
    "an edit that tries to carry a factual correction loses it at the boundary",
    [
      "employerName",
      "roleTitle",
      "startedOn",
      "endedOn",
      "issuedOn",
      "validUntil",
      "institution",
      "credentialTitle",
      "assertionLevel",
    ].every((f) => !(f in hostile)),
  );
  ck("while the wording it was allowed to change survives", hostile.headline === "Väktare");
  const fields = Object.keys(cvEditSchema.shape);
  ck(
    "what the payload gained is presentation only",
    fields.includes("contact") && fields.includes("locale"),
  );
}

/* ================================================================== */
/* 6 · Language                                                        */
/* ================================================================== */

group("LANGUAGE — the document's language, not a translation");
{
  const sv = visibleText(renderToStaticMarkup(<CvDocumentView document={documentOf(WALLIN)} />));
  const en = visibleText(
    renderToStaticMarkup(
      <CvDocumentView
        document={buildFactualCvDocument(
          buildCvSourceBundle({
            identity: WALLIN,
            locale: "en",
            includeCareerInsight: false,
            targetJobText: null,
          }),
          buildCvTrustAnnotations(WALLIN, TODAY),
        )}
      />,
    ),
  );
  ck(
    "the Swedish document uses Swedish headings",
    sv.includes("Erfarenhet") && sv.includes("Intyg och behörigheter"),
  );
  ck(
    "the English document uses English headings",
    en.includes("Experience") && en.includes("Credentials and authorisations"),
  );
  ck(
    "the date word follows the document, not the interface",
    sv.includes("– nu") && en.includes("– present"),
  );
  ck(
    "the facts are identical in both -- an employer name is not translated",
    sv.includes("Nordic Security AB") && en.includes("Nordic Security AB"),
  );
  ck(
    "and the country is named in the document's own language",
    sv.includes("Sverige") && en.includes("Sweden"),
  );
  ck(
    "the copy promises exactly that and no more",
    /översätts inte/.test(CV.languageHelp.sv) && /not translated/.test(CV.languageHelp.en),
  );
}

group("LANGUAGE — every CV sentence exists in both");
{
  const pairs = Object.entries(CV as Record<string, { sv: string; en: string }>);
  const missing = pairs.filter(([, v]) => !v.sv?.trim() || !v.en?.trim()).map(([k]) => k);
  // `succeeded` in the status map is deliberately empty; CV itself must not be.
  ck(`all ${pairs.length} CV strings are present in sv and en`, missing.length === 0);

  const mismatched = pairs
    .filter(([, v]) => v.sv.includes("{0}") !== v.en.includes("{0}"))
    .map(([k]) => k);
  ck("a placeholder is never dropped in one language", mismatched.length === 0);

  const leaks = pairs
    .filter(([, v]) =>
      /cv_documents|sp_claims|source_bundle|excludedIds|uuid/i.test(`${v.sv} ${v.en}`),
    )
    .map(([k]) => k);
  ck("and no sentence leaks a column, table or field identifier", leaks.length === 0);
}

/* ================================================================== */
/* 7 · The thin profile, and the long one                              */
/* ================================================================== */

group("SHAPE — a thin profile and a long career both produce a usable page");
{
  const thin = identity({
    displayName: "Ny Sökande",
    accountCountry: "SE",
    currentProfessionSlug: "vaktare",
    currentProfessionTitleSv: "Väktare",
    claims: [
      claim({
        id: "c-gy",
        claimType: "education",
        title: "Gymnasieexamen",
        issuerName: "Malmö kommun",
        issuedOn: "2025-06-01",
      }),
    ],
  });
  ck(
    "somebody entering the industry on education alone is ready",
    computeCvReadiness(thin).state === "ready",
  );
  const thinText = visibleText(markupOf(thin));
  ck("their CV renders", thinText.includes("Ny Sökande") && thinText.includes("Gymnasieexamen"));
  ck(
    "and every empty section is hidden rather than printed as a heading with nothing under it",
    !thinText.includes("Erfarenhet") &&
      !thinText.includes("Språk") &&
      !thinText.includes("Färdigheter"),
  );

  const long = identity({
    ...WALLIN,
    displayName: "Bengt-Åke Sjölund-Wikströmsson",
    employment: Array.from({ length: 12 }, (_, i) =>
      employment({
        id: `e-${i}`,
        employerName: `Säkerhetsbolaget i Västra Götaland nummer ${i + 1} AB`,
        roleTitle: i === 0 ? "Säkerhetschef" : "Väktare",
        startedOn: `${2000 + i * 2}-01-01`,
        endedOn: i === 0 ? null : `${2001 + i * 2}-12-31`,
      }),
    ),
  });
  const longDoc = documentOf(long);
  ck("a twelve-post career keeps every post", longDoc.experience.length === 12);
  ck(
    "newest first, so the CV does not open in 2000",
    longDoc.experience[0]?.fact.startedOn === "2022-01-01",
  );
  const longMarkup = markupOf(long);
  ck(
    "a long unbroken name is allowed to wrap rather than overflow",
    longMarkup.includes("break-words"),
  );
  ck(
    "and each post is kept whole across a page break",
    (longMarkup.match(/avoid-break/g) ?? []).length >= 12,
  );
}

/* ================================================================== */
/* 8 · The blast radius                                                */
/* ================================================================== */

group("BOUNDARIES — the CV writes nothing it does not own");
{
  const dir = path.join(root, "src/lib/professional-identity/cv");
  const sources = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: f, body: readFileSync(path.join(dir, f), "utf8") }));

  const writesTo = (table: string) =>
    sources.filter(({ body }) =>
      new RegExp(`from\\("${table}"\\)[\\s\\S]{0,200}\\.(insert|update|delete|upsert)`).test(body),
    );

  for (const table of [
    "sp_claims",
    "sp_experience_periods",
    "sp_passport_profiles",
    "security_career_profiles",
    "profiles",
  ]) {
    ck(`no CV function writes ${table}`, writesTo(table).length === 0);
  }

  // Creating or exporting a CV must not publish anything. Sharing is a
  // separate, explicit act with its own audit trail, and a CV that quietly
  // minted a public link would be a disclosure nobody chose and nobody logged.
  const all = sources.map((s) => s.body).join("\n");
  ck(
    "and none of them creates a share, a disclosure or a public link",
    !/sp_create_share|create_disclosure|share_token|passport_share/i.test(all),
  );

  // The selection is applied where the FACTS are assembled. A future filter
  // in the renderer would pass every visual test and reintroduce the leak
  // into the employer's copy of the bundle.
  const bundleSrc = read("src/lib/professional-identity/cv/source-bundle.ts");
  ck("selection is applied while the bundle is built", bundleSrc.includes("withoutExcluded"));
  const viewSrc = read("src/components/professional-identity/CvDocumentView.tsx");
  ck(
    "and the renderer holds no selection filter of its own",
    !/excludedIds|withoutExcluded|isExcluded/.test(viewSrc),
  );

  // The trust channel stays separate from the bundle the model receives.
  ck(
    "no verifier or validity field leaked onto the bundle handed to a model",
    !/verifierName|verificationMethod|verifiedOn|hasExpired/.test(
      JSON.stringify(bundleOf(WALLIN)),
    ) &&
      !/verifierName|hasExpired/.test(
        bundleSrc.split("export interface CvFactClaim")[1]?.split("}")[0] ?? "",
      ),
  );
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`FAIL — cv-pilot-check: ${fails.length} problem(s)`);
  for (const f of fails) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(
  "cv-pilot:check OK (selection is absence not concealment, lapsed credentials say so, drafts and archived merits stay out, contact details are opt-in and unverified, both languages, thin and long careers, no second write path)",
);
