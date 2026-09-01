// Applying with a CQrityjob CV — asserted against the contract and the markup.
//
// Run via `bun run cv-application-source:check`.
//
// ── WHAT WENT WRONG ────────────────────────────────────────────────────
//
// A candidate could build a CV inside CQrityjob and then, on the apply
// dialog of a CQrityjob job, was required to attach a PDF. The only way to
// use the CV the platform already held was to print it to PDF and upload it
// back into the same platform. Independent pilot testing found it, and it
// is the one promise a "connected professional identity" cannot break.
//
// ── WHAT THIS GUARD CAN AND CANNOT PROVE ───────────────────────────────
//
// It proves the things that live in TypeScript: the eligibility rule, the
// snapshot-to-document rebuild, what the employer's markup actually shows,
// what the dialog offers, and sv/en parity.
//
// It deliberately does NOT try to prove the boundaries. "Candidate A cannot
// attach candidate B's CV" and "employer A cannot read employer B's
// application" are properties of RLS and of a SECURITY INVOKER function, and
// a source scan asserting them would be a comfortable lie. Those are proved
// by executing them, in
// supabase/tests/job_application_cv_source_test.sql.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { CvDocumentView } from "../src/components/professional-identity/CvDocumentView";
import {
  applicationCvDocument,
  applicationCvSnapshotSchema,
  cvApplicationBlock,
  isCvUsableForApplication,
} from "../src/lib/professional-identity/cv/application-source";
import type { CvSourceBundle } from "../src/lib/professional-identity/cv/source-bundle";
import { dictionaries } from "../src/i18n/dictionaries";

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

/** Markup with the tags taken out, so an assertion about what a person reads
 *  is not accidentally satisfied by a class name. */
function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DIALOG = read("src/components/jobs/ApplyInternalDialog.tsx");
const SERVERFN = read("src/lib/job-intelligence/applications.functions.ts");
const EMPLOYER_PAGE = read(
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx",
);
const MIGRATION = read("supabase/migrations/20261018090000_job_application_cqrityjob_cv.sql");

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function bundle(over: Partial<CvSourceBundle> = {}): CvSourceBundle {
  return {
    bundleVersion: "cv-source-bundle-v1",
    locale: "sv",
    identity: {
      displayName: "Anna Andersson",
      headline: "Väktare med tio års erfarenhet",
      country: "Sverige",
      currentProfession: "Väktare",
      yearsOfExperience: "10+",
    },
    employment: [
      {
        id: "emp-1",
        employerName: "Bevakning AB",
        roleTitle: "Väktare",
        startedOn: "2016-01-01",
        endedOn: null,
        employmentType: "permanent",
        assertionLevel: "verified",
      },
    ],
    education: [],
    credentials: [
      {
        id: "cl-1",
        claimType: "credential",
        title: "Väktarutbildning VU1",
        issuerName: "BYA",
        issuedOn: "2016-02-01",
        validUntil: null,
        level: null,
        verified: true,
      },
    ],
    skills: [],
    languages: [],
    careerInsight: null,
    targetJobText: null,
    ...over,
  } as CvSourceBundle;
}

/** What the database writes onto an application. Built the way the migration
 *  builds it: the bundle without `targetJobText`, the presentation without
 *  `tailoringRationale`. */
function snapshot(b: CvSourceBundle = bundle()) {
  const { targetJobText: _dropped, ...rest } = b as CvSourceBundle & {
    targetJobText: string | null;
  };
  return applicationCvSnapshotSchema.parse({
    snapshot_version: "application-cv-snapshot-v1",
    cv_document_id: "11110000-0000-0000-0000-000000000001",
    cv_updated_at: "2026-08-20T10:00:00.000Z",
    title: "CV för Nordic Security",
    locale: "sv",
    purpose: "general",
    origin: "factual",
    document_version: "cv-document-v1",
    bundle_version: "cv-source-bundle-v1",
    source_bundle: rest,
    presentation: {
      headline: "Väktare med tio års erfarenhet",
      summary: "",
      experience: [{ sourceId: "emp-1", bullets: ["Ronderande bevakning i Stockholm."] }],
      emphasisedClaimIds: [],
      authorship: { headline: "person", summary: "person", bullets: {} },
    },
  });
}

/* ================================================================== */
group("GROUP A — eligibility: an unusable draft cannot masquerade as a CV");
/* ================================================================== */

ck("a CV with a name and an employment can be sent", isCvUsableForApplication(bundle()));
ck(
  "a CV with a name and only education can be sent (entering the industry)",
  isCvUsableForApplication(
    bundle({
      employment: [],
      education: [
        {
          id: "ed-1",
          claimType: "education",
          title: "Säkerhetsprogrammet",
          issuerName: "Yrkeshögskolan",
          issuedOn: "2015-06-01",
          validUntil: null,
          level: null,
          verified: false,
        },
      ],
    }),
  ),
);
ck(
  "a CV with no name is blocked, and says which reason",
  cvApplicationBlock(bundle({ identity: { ...bundle().identity, displayName: "   " } })) ===
    "no_name",
);
ck(
  "a CV with no employment and no education is blocked as no_history",
  cvApplicationBlock(bundle({ employment: [], education: [] })) === "no_history",
);
ck(
  "skills and languages alone are NOT a professional history",
  cvApplicationBlock(
    bundle({
      employment: [],
      education: [],
      skills: [
        {
          id: "sk-1",
          claimType: "skill",
          title: "Rapportskrivning",
          issuerName: null,
          issuedOn: null,
          validUntil: null,
          level: null,
          verified: false,
        },
      ],
    }),
  ) === "no_history",
);
ck("an absent bundle is blocked rather than silently usable", cvApplicationBlock(null) !== null);

// The rule is stated twice on purpose (interface + database). If either copy
// moves, this fails and names the other.
ck(
  "the database states the same eligibility rule",
  /identity,displayName/.test(MIGRATION) &&
    /jsonb_array_length\(coalesce\(_bundle -> 'employment'/.test(MIGRATION) &&
    /jsonb_array_length\(coalesce\(_bundle -> 'education'/.test(MIGRATION),
);
ck(
  "each copy of the eligibility rule points at the other",
  /isCvUsableForApplication/.test(MIGRATION) &&
    read("src/lib/professional-identity/cv/application-source.ts").includes(
      "20261018090000_job_application_cqrityjob_cv.sql",
    ),
);

/* ================================================================== */
group("GROUP B — the submitted artefact rebuilds into the same document");
/* ================================================================== */

const doc = applicationCvDocument(snapshot());
ck("a stored snapshot rebuilds into a document", doc !== null);

const markup = doc ? renderToStaticMarkup(<CvDocumentView document={doc} />) : "";
const text = visibleText(markup);

ck("the employer sees the candidate's name", text.includes("Anna Andersson"));
ck("the employer sees the employer name and role", text.includes("Bevakning AB"));
ck("the employer sees the candidate's own bullet", text.includes("Ronderande bevakning"));
ck("the employer sees the credential title", text.includes("Väktarutbildning VU1"));
ck("the employer sees the issuer as an issuer", text.includes("BYA"));

// The single most important negative on this page. Provenance is never
// stored, so a copy cannot carry it, so the submitted CV cannot claim a
// verifier — and cannot go stale claiming one either.
ck(
  "no verifier attribution is rendered from a stored copy",
  doc !== null &&
    Object.keys(doc.trust.employment).length === 0 &&
    Object.keys(doc.trust.claims).length === 0,
);
ck(
  "trust is not reported as UNAVAILABLE either — it is simply not part of this artefact",
  doc !== null && doc.trust.unavailable === false,
);
// The fixture's credential carries `verified: true` in the frozen bundle,
// because that flag is part of the saved document's schema. It must still
// not put a verification mark in front of an employer: CvDocumentView reads
// the LIVE annotations for that and the copy has none, so a confirmation
// revoked after submission cannot survive here. A CV may freeze career
// content; it must never freeze trust.
ck(
  "a frozen `verified` flag does not become a verification mark for the employer",
  !text.includes("Verifierad") && !text.includes("Verified"),
);

// No identifier of any kind reaches the page.
for (const forbidden of [
  "11110000-0000-0000-0000-000000000001",
  "application-cv-snapshot-v1",
  "cv-source-bundle-v1",
  "cv_document_id",
]) {
  ck(`the rendered CV never prints "${forbidden}"`, !markup.includes(forbidden));
}
// The candidate's own filing name for the CV may name a DIFFERENT employer.
ck("the rendered CV never prints the candidate's private title for it", !text.includes("Nordic"));

/* ================================================================== */
group("GROUP C — unknown is never none");
/* ================================================================== */

ck(
  "a snapshot that cannot be read returns null rather than an empty document",
  applicationCvDocument(applicationCvSnapshotSchema.parse({ source_bundle: {} })) === null,
);
ck(
  "the employer read reports `unreadable` separately from `no CV`",
  /unreadable: document === null/.test(SERVERFN) && /readonly unreadable: boolean/.test(SERVERFN),
);
ck(
  "the employer page renders the unreadable state rather than an empty section",
  /submittedCv\.unreadable \?/.test(EMPLOYER_PAGE) &&
    /employer\.candidate\.cv\.unreadable/.test(EMPLOYER_PAGE),
);
ck(
  "a failed CV list read is its own dialog state, not an empty list",
  /status: "unavailable"/.test(DIALOG) && /jobs\.apply\.cv\.unavailable/.test(DIALOG),
);
ck(
  "the CV list server function throws instead of returning []",
  /CV_LIST_UNAVAILABLE/.test(read("src/lib/professional-identity/cv/cv-store.functions.ts")),
);

/* ================================================================== */
group("GROUP D — the dialog offers both sources and forces neither");
/* ================================================================== */

ck("the dialog reads the candidate's saved CVs", /listMyApplicationCvOptions/.test(DIALOG));
ck(
  "there is a CQrityjob CV radio option",
  /value="cqrityjob_cv"/.test(DIALOG) && /jobs\.apply\.cv\.source\.cqrityjob/.test(DIALOG),
);
ck(
  "the external upload path survives, with its file input intact",
  /type="file"/.test(DIALOG) && /accept="application\/pdf,\.pdf"/.test(DIALOG),
);
ck(
  "multiple usable CVs are chosen from explicitly",
  /jobs\.apply\.cv\.choose/.test(DIALOG) && /<select/.test(DIALOG),
);
ck("the person always sees WHICH CV will be submitted", /jobs\.apply\.cv\.updated/.test(DIALOG));
ck(
  "selecting a CV is named as a disclosure next to the control",
  /jobs\.apply\.cv\.shared/.test(DIALOG),
);
ck(
  "an unusable CV is named with its reason and a route to finish it",
  /BLOCK_MESSAGE_KEY/.test(DIALOG) && /jobs\.apply\.cv\.finish/.test(DIALOG),
);
ck(
  "attaching a file switches the source to upload rather than leaving it stale",
  /setFile\(f\);[\s\S]{0,400}setCvSource\("upload"\)/.test(DIALOG),
);
ck(
  "submitting requires a source: a file for upload, a CV for cqrityjob_cv",
  /cvSource === "upload" \? file !== null : selectedCvId !== null/.test(DIALOG),
);
ck(
  "the confirmation reports the source the SERVER recorded",
  /setSubmittedSource\(res\.cvSource\)/.test(DIALOG),
);
// Regression guard on the pre-existing contract this release must not weaken.
ck(
  "the Passport checkbox is still optional and still separate",
  /setIncludePassport\(v === true\)/.test(DIALOG) &&
    /setPassportShared\(res\.passportShared\)/.test(DIALOG),
);

/* ================================================================== */
group("GROUP E — no second CV store, no second access path");
/* ================================================================== */

ck(
  "the client sends an ID, never a document: the payload has no snapshot field",
  !/cvDocumentSnapshot|cvSnapshot|sourceBundle:/.test(DIALOG) &&
    !/_cv_document_snapshot/.test(SERVERFN),
);
ck(
  "the database builds the snapshot itself",
  /_snapshot := jsonb_build_object/.test(MIGRATION) &&
    !/_cv_document_snapshot\s+jsonb/.test(MIGRATION),
);
ck(
  "the employer read never uses the service role",
  (() => {
    const start = SERVERFN.indexOf("export const getApplicationSubmittedCv");
    const end = SERVERFN.indexOf("export const", start + 10);
    const body = SERVERFN.slice(start, end === -1 ? undefined : end);
    return start !== -1 && !body.includes("supabaseAdmin");
  })(),
);
ck(
  "the employer read is gated by the same membership rule as the CV download",
  /getApplicationSubmittedCv[\s\S]{0,2600}assertEmployerWorkspaceMember/.test(SERVERFN),
);
// Prose about cv_documents is welcome; a QUERY against it from an employer
// surface is the thing that would open the second access path.
ck(
  "no surface reads cv_documents on an employer's behalf",
  !/from\(\s*["'`]cv_documents/.test(EMPLOYER_PAGE) && !/from\(\s*["'`]cv_documents/.test(SERVERFN),
);
ck(
  "the migration adds no employer policy to cv_documents",
  !/ON public\.cv_documents/.test(MIGRATION),
);
ck(
  "no new CV table and no second PDF generator are introduced",
  !/CREATE TABLE/i.test(MIGRATION) && !/pdfkit|jspdf|puppeteer/i.test(MIGRATION + SERVERFN),
);

/* ================================================================== */
group("GROUP F — old applications keep working");
/* ================================================================== */

ck(
  "cv_source defaults to 'upload' so every existing row stays valid",
  /ADD COLUMN IF NOT EXISTS cv_source text NOT NULL DEFAULT 'upload'/.test(MIGRATION),
);
ck(
  "the shape rule refuses an application that claims a CV it does not hold",
  /job_applications_cv_source_shape_check/.test(MIGRATION),
);
ck(
  "the old submission entry point keeps its exact signature",
  /CREATE OR REPLACE FUNCTION public\.sp_submit_application_with_passport\(/.test(MIGRATION) &&
    /_include_passport\s+boolean DEFAULT false\)/.test(MIGRATION),
);
ck(
  "it delegates rather than duplicating the implementation",
  /RETURN public\.sp_submit_application_with_cv_source\(/.test(MIGRATION),
);
ck(
  "deleting a saved CV does not delete or alter the application",
  /REFERENCES public\.cv_documents\(id\) ON DELETE SET NULL/.test(MIGRATION),
);
ck(
  "an uploaded CV is still downloaded as a file",
  /employer\.applications\.action\.downloadCv/.test(EMPLOYER_PAGE),
);
ck(
  "the signed-URL path refuses a CQrityjob CV precisely, not as 'no CV'",
  /CV_IS_NOT_A_FILE/.test(SERVERFN),
);

/* ================================================================== */
group("GROUP G — privacy: what a CQrityjob CV must not carry");
/* ================================================================== */

ck(
  "the stored snapshot drops targetJobText (it may quote another employer's advert)",
  /'source_bundle', _bundle - 'targetJobText'/.test(MIGRATION),
);
ck(
  "the stored snapshot drops tailoringRationale for the same reason",
  /- 'tailoringRationale'/.test(MIGRATION),
);
ck(
  "the snapshot contract models neither of them",
  (() => {
    const src = read("src/lib/professional-identity/cv/application-source.ts");
    const schema = src.slice(src.indexOf("applicationCvSnapshotSchema"));
    return !/targetJobText|tailoringRationale/.test(
      schema.slice(0, schema.indexOf("export type ApplicationCvSnapshot")),
    );
  })(),
);
ck(
  "the candidate's private title for the CV is withheld from the employer",
  /title: isApplicant && parsed\.success/.test(SERVERFN),
);
ck(
  "the employer page prints the source in human language, never an identifier",
  /employer\.candidate\.cv\.cqrityjob/.test(EMPLOYER_PAGE) &&
    !/cv_document_id|cv_document_snapshot|snapshot_version/.test(EMPLOYER_PAGE),
);
ck(
  "the employer page says the document is a point-in-time submission",
  /employer\.candidate\.cv\.snapshotNote/.test(EMPLOYER_PAGE),
);

/* ================================================================== */
group("GROUP H — sv/en parity for every new string");
/* ================================================================== */

const NEW_KEYS = [
  "jobs.apply.cv.legend",
  "jobs.apply.cv.loading",
  "jobs.apply.cv.unavailable",
  "jobs.apply.cv.source.cqrityjob",
  "jobs.apply.cv.source.upload",
  "jobs.apply.cv.choose",
  "jobs.apply.cv.untitled",
  "jobs.apply.cv.updated",
  "jobs.apply.cv.shared",
  "jobs.apply.cv.sharedGeneric",
  "jobs.apply.cv.none",
  "jobs.apply.cv.create",
  "jobs.apply.cv.finish",
  "jobs.apply.cv.unusableHeading",
  "jobs.apply.cv.block.noName",
  "jobs.apply.cv.block.noHistory",
  "jobs.apply.error.cvSourceRequired",
  "jobs.apply.error.cvDocumentNotFound",
  "jobs.apply.error.cvDocumentNotReady",
  "jobs.apply.success.cvCqrityjob",
  "jobs.apply.success.cvUpload",
  "employer.candidate.cv.heading",
  "employer.candidate.cv.cqrityjob",
  "employer.candidate.cv.submittedOn",
  "employer.candidate.cv.snapshotNote",
  "employer.candidate.cv.unreadable",
  "candidate.applications.cv.cqrityjob",
] as const;

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

for (const key of NEW_KEYS) {
  ck(
    `${key} exists in both languages and neither is empty`,
    typeof sv[key] === "string" &&
      sv[key].trim().length > 0 &&
      typeof en[key] === "string" &&
      en[key].trim().length > 0,
  );
}
ck(
  "the placeholder-carrying strings keep their placeholder in both languages",
  ["jobs.apply.cv.updated", "jobs.apply.cv.shared", "employer.candidate.cv.submittedOn"].every(
    (k) => {
      const token = k === "jobs.apply.cv.shared" ? "{employer}" : "{date}";
      return sv[k].includes(token) && en[k].includes(token);
    },
  ),
);
// No raw identifier may reach a candidate or an employer through copy.
ck(
  "no new string leaks a column, table or version identifier",
  NEW_KEYS.every(
    (k) => !/cv_document|cv_source|snapshot_version|cv-source-bundle|uuid/i.test(sv[k] + en[k]),
  ),
);

/* ================================================================== */
console.log(
  fails.length === 0
    ? `\ncv-application-source:check OK (eligibility, snapshot rebuild and rendered markup, ` +
        `unknown-is-not-none, both sources offered, no second CV store or access path, ` +
        `old applications preserved, privacy omissions, ${NEW_KEYS.length} keys in sv/en)`
    : `\ncv-application-source:check FAILED\n${fails.map((f) => "  - " + f).join("\n")}`,
);
process.exit(fails.length === 0 ? 0 : 1);
