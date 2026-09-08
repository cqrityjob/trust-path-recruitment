// WHAT ACTUALLY LEAVES THIS PRODUCT WHEN A CV IS DRAFTED.
//
// Run via `bun run cv-provider-minimisation:check`.
//
// ── WHY THIS IS ITS OWN GUARD ──────────────────────────────────────────
//
// Every other check in this feature asks what a person READS. This one asks
// what a third party RECEIVES, and the two have nothing to do with each
// other: a page can be perfectly minimal about a candidate while the request
// behind it carries their name, the primary keys of their Passport rows and
// the identifier of an assessment they took.
//
// It did. `generateCvPresentation` passed the entire source bundle as
// `governedContext: { facts: bundle }`, and that bundle carries
// `identity.displayName`, a uuid on every employment and every claim, and
// `careerInsight.snapshotId`. None of it is needed to write three bullet
// points. All of it is a stable identifier for one human being, sent to an
// engine that may log it.
//
// ── WHAT MINIMISATION MEANS HERE, PRECISELY ────────────────────────────
//
// Not "less". Not "probably fine". The rule is that the serialised request
// contains no value from which somebody could re-identify the candidate or
// join this request to another record:
//
//   NO display name          the model is asked to phrase experience, not to
//                            address anybody.
//   NO database uuid         of any shape, anywhere in the payload. The
//                            assertion is a regex over the whole serialised
//                            request, not a field list, because a field list
//                            only covers the fields somebody thought of.
//   NO Career Insight id     it identifies an assessment run. The model is
//                            told THAT a career-direction result exists, when
//                            the person opted in, and never which one.
//   NO contact details       they were never in the bundle and this asserts
//                            it stays that way.
//   ORDINAL KEYS instead     `e1`, `c3` — meaningful only inside one request,
//                            useless as a join key, and remapped back to real
//                            ids on the way home.
//
// ── AND WHY THE REMAP IS ASSERTED TOO ──────────────────────────────────
//
// A minimised request that produced an unusable answer would be a worse
// product, not a safer one. So the round trip is exercised: the model cites
// `e1`, the server turns it back into the employment it means, and the
// anti-fabrication sweep still rejects a citation of something that was never
// offered.
//
// Deterministic, credential-free, network-free: the provider is a stub that
// records the request it was handed.

import { renderToStaticMarkup } from "react-dom/server";
import { CvDocumentView } from "../src/components/professional-identity/CvDocumentView";
import {
  generateCvPresentation,
  type CvGenerationResult,
} from "../src/lib/professional-identity/cv/generation";
import { buildCvSourceBundle } from "../src/lib/professional-identity/cv/source-bundle";
import { buildCvTrustAnnotations } from "../src/lib/professional-identity/cv/trust-annotations";
import { applyCvPresentation } from "../src/lib/professional-identity/cv/document";
import type {
  AiProvider,
  AiRequest,
  AiResponse,
} from "../src/lib/interview-intelligence/ai/provider";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(detail ? `${name} — ${detail}` : name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const TODAY = "2026-09-08";

/* ------------------------------------------------------------------ */
/* A provider that answers, and remembers what it was asked            */
/* ------------------------------------------------------------------ */

class RecordingProvider implements AiProvider {
  readonly modelId = "recording-stub";
  request: AiRequest | null = null;

  constructor(private readonly reply: (req: AiRequest) => string) {}

  async complete(request: AiRequest): Promise<AiResponse> {
    this.request = request;
    return { text: this.reply(request), model: this.modelId, latencyMs: 1 };
  }
}

/** The ids the model was actually offered, read back out of the request. */
function offeredIds(request: AiRequest): string[] {
  const facts = (request.governedContext as { facts?: Record<string, unknown> }).facts ?? {};
  const out: string[] = [];
  for (const key of ["employment", "education", "credentials", "skills", "languages"]) {
    for (const row of (facts[key] as { id?: string }[] | undefined) ?? []) {
      if (row.id) out.push(row.id);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

const EMPTY: ProfessionalIdentityV1 = {
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

const EMP_1 = "3f1b0a44-6c2e-4f19-9a77-1b2c3d4e5f60";
const EMP_2 = "7c9d1e22-8a3f-4b55-9e01-2d3c4b5a6978";
const CLAIM_1 = "a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061";
const CLAIM_2 = "b2c3d4e5-f607-4819-a0b1-2c3d4e5f6172";
const SNAPSHOT = "9f8e7d6c-5b4a-4392-8180-7f6e5d4c3b2a";

const KARIN: ProfessionalIdentityV1 = {
  ...EMPTY,
  displayName: "Karin Wallin",
  accountCountry: "SE",
  workCountry: "SE",
  hasPassport: true,
  headline: "Väktare med sex års erfarenhet",
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  yearsOfExperience: "5-10",
  employment: [
    {
      id: EMP_1,
      employerName: "Nordic Security AB",
      roleTitle: "Väktare",
      startedOn: "2022-03-01",
      endedOn: null,
      employmentType: "full_time",
      jurisdictionCode: "SE",
      assertionLevel: "verified",
      verifierName: "Nordic Security AB",
      verificationMethod: "employer_confirmation",
      verifiedOn: "2024-02-01",
    },
    {
      id: EMP_2,
      employerName: "Stadsvakt i Malmö AB",
      roleTitle: "Ordningsvakt",
      startedOn: "2019-06-01",
      endedOn: "2022-02-28",
      employmentType: "full_time",
      jurisdictionCode: "SE",
      assertionLevel: "self_declared",
      verifierName: null,
      verificationMethod: null,
      verifiedOn: null,
    },
  ],
  claims: [
    {
      id: CLAIM_1,
      claimType: "certification",
      title: "Väktarutbildning VU1",
      issuerName: "BYA",
      issuedOn: "2019-04-01",
      validUntil: "2028-04-01",
      skillLevel: null,
      assertionLevel: "verified",
      lifecycleState: "active",
      verifierName: "BYA",
      verificationMethod: "source_confirmation",
      verifiedOn: "2024-02-01",
    },
    {
      id: CLAIM_2,
      claimType: "language",
      title: "Engelska",
      issuerName: null,
      issuedOn: null,
      validUntil: null,
      skillLevel: "B2",
      assertionLevel: "self_declared",
      lifecycleState: "active",
      verifierName: null,
      verificationMethod: null,
      verifiedOn: null,
    },
  ],
  discovery: {
    hasCompletedReport: true,
    snapshotId: SNAPSHOT,
    generatedAt: "2026-05-01T00:00:00Z",
    namesCareers: true,
  },
};

const bundle = buildCvSourceBundle({
  identity: KARIN,
  locale: "sv",
  includeCareerInsight: true,
  targetJobText: null,
});

/* ------------------------------------------------------------------ */

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

async function run(): Promise<void> {
  /** Answer using whatever ids the request actually offered, so the same stub
   *  works before and after minimisation and the assertions stay honest. */
  const provider = new RecordingProvider((req) => {
    const ids = offeredIds(req);
    return JSON.stringify({
      headline: "Väktare",
      summary:
        "Erfaren väktare med bakgrund inom ronderande bevakning och ordningshållning i city.",
      experience: [{ sourceId: ids[0] ?? "e1", bullets: ["Ronderande bevakning."] }],
      emphasisedClaimIds: [],
      tailoringRationale: "Ordnad kronologiskt.",
    });
  });

  const result: CvGenerationResult = await generateCvPresentation(bundle, {
    provider,
    providerMode: "synthetic",
  });

  const request = provider.request;
  if (!request) throw new Error("the provider was never called");
  const serialised = JSON.stringify(request);

  group("WHAT LEAVES — the serialised provider request");
  ck("the provider was called", request !== null);
  ck(
    "no display name",
    !serialised.includes("Karin Wallin"),
    "the candidate's name is in the request",
  );
  ck(
    "no database uuid of any shape, anywhere in the payload",
    !UUID.test(serialised),
    `found ${UUID.exec(serialised)?.[0]}`,
  );
  ck("no employment id", !serialised.includes(EMP_1) && !serialised.includes(EMP_2));
  ck("no claim id", !serialised.includes(CLAIM_1) && !serialised.includes(CLAIM_2));
  ck("no Career Insight snapshot id", !serialised.includes(SNAPSHOT));
  ck(
    "no contact detail",
    !/"email"|"phone"|showEmail|showPhone/i.test(serialised),
    "a contact field reached the request",
  );

  group("WHAT REMAINS — enough to write a CV with");
  const facts = (request.governedContext as { facts?: Record<string, unknown> }).facts ?? {};
  ck(
    "the employments are there, with their real career content",
    serialised.includes("Nordic Security AB") && serialised.includes("Ordningsvakt"),
  );
  ck("and their dates", serialised.includes("2022-03") && serialised.includes("2019-06"));
  ck("the credentials are there", serialised.includes("Väktarutbildning VU1"));
  ck(
    "each fact carries an ordinal key, meaningful only inside this request",
    offeredIds(request).length === 4 && offeredIds(request).every((id) => /^[ec]\d+$/.test(id)),
    `got ${offeredIds(request).join(", ")}`,
  );
  ck(
    "the career-direction opt-in is a flag, not an identifier",
    facts.careerInsight === true || facts.careerInsight === false,
    `careerInsight is ${JSON.stringify(facts.careerInsight)}`,
  );

  group("THE ANSWER COMES HOME — ordinal keys are remapped, and still checked");
  ck("the run succeeded", result.status === "succeeded", result.failureReason ?? "");
  ck(
    "the citation was remapped back to a real employment id",
    result.presentation?.experience[0]?.sourceId === EMP_1,
    `got ${result.presentation?.experience[0]?.sourceId}`,
  );

  const doc = applyCvPresentation(
    bundle,
    result.presentation!,
    buildCvTrustAnnotations(KARIN, TODAY),
  );
  const markup = renderToStaticMarkup(<CvDocumentView document={doc} />);
  ck(
    "the drafted bullet is rendered against the right employment",
    markup.includes("Ronderande bevakning.") && markup.includes("Nordic Security AB"),
  );

  // A model that invents an ordinal key must still be rejected. Minimisation
  // must not become a laundering step in which anything the remap does not
  // recognise is quietly dropped.
  const liar = new RecordingProvider(() =>
    JSON.stringify({
      headline: "Väktare",
      summary:
        "Erfaren väktare med bakgrund inom ronderande bevakning och ordningshållning i city.",
      experience: [{ sourceId: "e99", bullets: ["Ledde nationell insats."] }],
      emphasisedClaimIds: ["c99"],
      tailoringRationale: "Ordnad kronologiskt.",
    }),
  );
  const rejected = await generateCvPresentation(bundle, {
    provider: liar,
    providerMode: "synthetic",
  });
  ck(
    "a citation of an ordinal key that was never offered is rejected, not dropped",
    rejected.status === "fabrication_rejected",
    `status was ${rejected.status}`,
  );
  ck(
    "and the rejection names it as a fabricated citation",
    rejected.violations.some((v) => v.kind === "fabricated_citation"),
  );

  group("THE PROMPT ITSELF");
  ck(
    "the instruction tells the model the keys are local",
    /id|nyckel|key/i.test(request.instruction),
  );
  ck("and nothing in the system prompt names the candidate", !request.system.includes("Karin"));
}

await run();

console.log("");
if (fails.length > 0) {
  console.error(`FAIL — cv-provider-minimisation-check: ${fails.length} problem(s)`);
  for (const f of fails) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(
  "cv-provider-minimisation:check OK (no name, no uuid of any shape, no snapshot id, no contact; " +
    "ordinal keys out, real ids back, invented keys still rejected)",
);
