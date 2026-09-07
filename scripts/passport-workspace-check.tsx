// Security Passport — the workspace says only what the record supports, and
// asks for exactly one thing.
//
// Run via `bun run passport-workspace:check`.
//
// ── WHAT THIS PINS ─────────────────────────────────────────────────────
//
// PR #196 turns the Passport overview into a place a holder works. Four
// things can quietly stop being true afterwards, and each of them is one
// edit away at all times:
//
//   1. THE TRUST WORDS. "Registrerad", "Dokumenterad" and "Källbekräftad"
//      are headings over rungs that already exist. A document CQrityjob read
//      is Documented and never Källbekräftad; only a source confirming a
//      fact it was party to reaches that word; and no heading, count or
//      pill may say an ISSUER verified anything.
//
//   2. THE ARITHMETIC. The four figures plus the lapsed line partition the
//      holder's current merits exactly. A tile that silently contains
//      another is how a page comes to show more merits than a person owns.
//
//   3. THE ONE STEP. Exactly one recommendation, from the holder's real
//      rows, never from a standing that could not be read, never a passive
//      status, and always with a retirement condition that actually
//      retires it.
//
//   4. NO CONTRADICTION WITH MY CAREER. Every step this page shares with
//      the career ladder keeps the ladder's classification and relative
//      order, and lands on the same object.
//
// Rendered, not merely grepped, wherever the claim is about what a person
// reads. The component takes a plain derived object and no router, which is
// why it can be rendered here at all.

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    hash,
    search,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>))
        href = href.replace(`$${k}`, String(v));
    }
    if (search && typeof search === "object")
      href += "?" + new URLSearchParams(search as Record<string, string>).toString();
    if (hash) href += `#${hash}`;
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { PassportWorkspace } = await import("../src/components/security-passport/PassportWorkspace");
const { PASSPORT_WORKSPACE_VERSION, buildPassportWorkspace, meritHref, meritNeedsHolder } =
  await import("../src/lib/security-passport/workspace");
const { isArchivedMerit, isCurrentMerit, isUnfinishedMerit } =
  await import("../src/lib/security-passport/types");
const { ACTION_CLASSIFICATION, subjectHref } =
  await import("../src/lib/professional-identity/next-best-action");
const { deriveVerificationAttention, VERIFICATION_ATTENTION_UNAVAILABLE } =
  await import("../src/lib/professional-identity/verification-attention");
const { labelMerit } = await import("../src/lib/professional-identity/passport-merits");
const { passportT } = await import("../src/lib/security-passport/i18n");

import type { Claim, ExperiencePeriod, LifecycleState } from "../src/lib/security-passport/types";
import type { MyVerificationRequest } from "../src/lib/security-passport/verification.functions";
import type {
  PassportWorkspace as Workspace,
  WorkspaceStepKind,
} from "../src/lib/security-passport/workspace";

/* ------------------------------------------------------------------ */

const fails: string[] = [];
function ck(name: string, okay: boolean, detail?: string): void {
  console.log(`  ${okay ? "ok  " : "FAIL"} ${name}${okay || !detail ? "" : `  -- ${detail}`}`);
  if (!okay) fails.push(name);
}
function group(title: string): void {
  console.log(`\n${title}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Source with comments stripped, so a comment EXPLAINING a forbidden word is
 *  not mistaken for the word being used. */
const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

const NOW = new Date("2026-09-07T09:00:00.000Z");

function html(workspace: Workspace, lang: "sv" | "en" = "sv"): string {
  return renderToStaticMarkup(
    <I18nProvider initialLang={lang}>
      <PassportWorkspace workspace={workspace} />
    </I18nProvider>,
  );
}
/** Markup with tags removed, so an assertion about what a READER sees cannot
 *  be satisfied by a class name or an attribute. */
const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function claim(over: Partial<Claim> = {}): Claim {
  return {
    id: "c-1",
    claimType: "certification",
    credentialCode: null,
    skillCode: null,
    skillLevel: null,
    titleSv: "Väktarutbildning grundkurs",
    titleEn: "Security officer foundation course",
    issuerName: "BYA",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2024-05-02",
    validFrom: "2024-05-02",
    validUntil: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    limitationSv: null,
    limitationEn: null,
    versionNo: 1,
    supersedesClaimId: null,
    ...over,
  };
}

function period(over: Partial<ExperiencePeriod> = {}): ExperiencePeriod {
  return {
    id: "p-1",
    employerName: "Nordic Security AB",
    roleTitle: "Väktare",
    professionSlug: null,
    jurisdictionCode: "SE",
    employmentType: "full_time",
    fteFraction: 1,
    securityRelevance: "primary",
    securityFraction: 1,
    startedOn: "2023-02-01",
    endedOn: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

function request(over: Partial<MyVerificationRequest> = {}): MyVerificationRequest {
  return {
    id: "r-1",
    claimId: null,
    periodId: null,
    kind: "cqrityjob_review",
    status: "pending",
    submittedAt: "2026-09-01T09:00:00.000Z",
    decidedAt: null,
    method: null,
    holderMessage: null,
    validFrom: null,
    validUntil: null,
    targetEmployerId: null,
    ...over,
  };
}

function build(input: {
  claims?: readonly Claim[];
  periods?: readonly ExperiencePeriod[];
  requests?: readonly MyVerificationRequest[];
  unavailable?: boolean;
}): Workspace {
  return buildPassportWorkspace({
    claims: input.claims ?? [],
    periods: input.periods ?? [],
    attention: input.unavailable ? null : deriveVerificationAttention(input.requests ?? [], NOW),
    now: NOW,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   1 · THE TRUST WORDS ARE THE ONES THE RECORD SUPPORTS
   ══════════════════════════════════════════════════════════════════════ */
group("1 · a document review is Documented, and only a source is Källbekräftad");

{
  const documented = build({
    claims: [
      claim({
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2026-06-01",
      }),
    ],
  });
  ck(
    "1.1 a CQrityjob document review labels the merit `documented`",
    documented.groups.current[0]?.label === "documented",
    documented.groups.current[0]?.label,
  );
  const t = text(html(documented));
  ck("1.2 and reads Dokumenterad, never Källbekräftad", t.includes("Dokumenterad"));
  ck("1.3 the source-confirmed word is absent from that Passport", !t.includes("Källbekräftad 1"));
  ck(
    "1.4 the source-confirmed COUNT for it is zero",
    documented.counts.verifiedCount === 0,
    String(documented.counts.verifiedCount),
  );

  const sourced = build({
    periods: [
      period({
        assertionLevel: "verified",
        verifierName: "Nordic Security AB",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2026-07-15",
      }),
    ],
  });
  ck(
    "1.5 an employer confirming an employment reaches `verified`",
    sourced.groups.current[0]?.label === "verified",
  );
  ck("1.6 and counts as source-confirmed, not as documented", sourced.counts.verifiedCount === 1);
  ck("1.7 documented stays zero for it", sourced.counts.documentedCount === 0);

  // The SUBJECT decides as much as the method. An employer confirmation
  // recorded against a CREDENTIAL is not a source confirmation, and the
  // workspace must not promote it into one by passing the wrong subject.
  const wrongSubject = build({
    claims: [
      claim({
        assertionLevel: "verified",
        verifierName: "BYA",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2026-06-01",
      }),
    ],
  });
  ck(
    "1.8 an employer confirmation on a CREDENTIAL is not source-confirmed",
    wrongSubject.counts.verifiedCount === 0 &&
      wrongSubject.groups.current[0]?.label === "documented",
    wrongSubject.groups.current[0]?.label,
  );

  // An issuer confirmation has no issuer identity behind it until the Issuer
  // Foundation release, so it may not present as source-confirmed either.
  const issuer = build({
    claims: [
      claim({
        assertionLevel: "verified",
        verifierName: "BYA",
        verificationMethod: "issuer_confirmation",
        verifiedOn: "2026-06-01",
      }),
    ],
  });
  ck(
    "1.9 an issuer confirmation does not present as source-confirmed",
    issuer.counts.verifiedCount === 0,
  );

  // A document ATTACHED is not a document REVIEWED. The two states this
  // product most needs to keep apart.
  const attached = build({ claims: [claim({ assertionLevel: "document_provided" })] });
  ck(
    "1.10 an attached document is not Documented",
    attached.counts.documentedCount === 0 && attached.counts.documentProvidedCount === 1,
  );
  ck(
    "1.11 and its own word is 'Dokument inlämnat', not 'Dokumenterad'",
    passportT("ws.merit.status.document_provided", "sv") === "Dokument inlämnat" &&
      passportT("ws.merit.status.document_provided", "en") === "Document provided",
  );
}

{
  // No workspace copy may attribute a verification to an ISSUER, and the
  // collective "Verifierade meriter" the brief refuses may not appear.
  const i18n = read("src/lib/security-passport/i18n.ts");
  const wsKeys = [...i18n.matchAll(/"(ws\.[a-zA-Z0-9._]+)":\s*(?:\n\s*)?"([^"]*)"/g)];
  ck("1.12 the workspace copy block exists", wsKeys.length > 20, String(wsKeys.length));
  const forbidden = [
    /verifierade meriter/i,
    /verified merits/i,
    /utfärdaren har verifierat/i,
    /verified by the issuer/i,
  ];
  const offenders = wsKeys.filter(([, , value]) => forbidden.some((re) => re.test(value)));
  ck(
    "1.13 no workspace string uses a collective 'verified merits' or credits an issuer",
    offenders.length === 0,
    offenders.map(([, k]) => k).join(", "),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2 · THE FIGURES PARTITION THE MERITS
   ══════════════════════════════════════════════════════════════════════ */
group("2 · four figures and a lapsed line, adding up to what the holder owns");

{
  const w = build({
    claims: [
      claim({
        id: "c-doc",
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2026-06-01",
      }),
      claim({ id: "c-open" }),
      claim({ id: "c-ask" }),
      claim({ id: "c-file", assertionLevel: "document_provided" }),
      claim({
        id: "c-lapsed",
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2022-04-01",
        validUntil: "2025-03-31",
      }),
    ],
    periods: [
      period({
        assertionLevel: "verified",
        verifierName: "Nordic Security AB",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2026-07-15",
      }),
      period({ id: "p-2" }),
    ],
    requests: [
      request({ id: "r-open", claimId: "c-open", status: "pending" }),
      request({ id: "r-ask", claimId: "c-ask", status: "clarification_requested" }),
    ],
  });

  const c = w.counts;
  const st = w.status;
  ck(
    "2.1 registered + documented + source-confirmed + in review + lapsed = every current merit",
    (st.registered ?? -1) + st.documented + st.sourceConfirmed + (st.inReview ?? -1) + st.lapsed ===
      c.addedCount,
    `${st.registered}+${st.documented}+${st.sourceConfirmed}+${st.inReview}+${st.lapsed} vs ${c.addedCount}`,
  );
  ck(
    "2.2 the 'registered' figure is a RUNG, never the total",
    (st.registered ?? 0) < c.addedCount,
    `${st.registered} vs ${c.addedCount}`,
  );

  const markup = html(w);
  const tile = (name: string) =>
    new RegExp(`data-status-tile="${name}"[^>]*data-count="([^"]*)"`).exec(markup)?.[1] ??
    new RegExp(`data-count="([^"]*)"[^>]*data-status-tile="${name}"`).exec(markup)?.[1] ??
    "";
  ck("2.3 the registered tile renders that rung", tile("registered") === String(st.registered));
  ck(
    "2.4 the documented tile renders the documented figure",
    tile("documented") === String(st.documented),
  );
  ck(
    "2.5 the source-confirmed tile renders the source-confirmed figure",
    tile("source-confirmed") === String(st.sourceConfirmed),
  );
  ck("2.6 the in-review tile renders both open shapes", tile("in-review") === String(st.inReview));
  // The COMPONENT does no arithmetic: a tile that added two fields together
  // is a second derivation, and the first thing such a tile forgets is that
  // one of its addends may be unknown.
  const componentSrc = code(read("src/components/security-passport/PassportWorkspace.tsx"));
  ck(
    "2.10 the component reads decided figures rather than adding counts up",
    !/counts\.\w+\s*\+/.test(componentSrc) && componentSrc.includes("status.registered"),
  );

  // The counts come from the SHARED derivation, not from a second count.
  const src = code(read("src/lib/security-passport/workspace.ts"));
  ck(
    "2.7 the workspace counts with countMeritRows from passport-merits",
    src.includes("countMeritRows") && src.includes("professional-identity/passport-merits"),
  );
  ck(
    "2.8 and labels with the shared labelMerit rather than a local rule",
    src.includes("labelMerit(") && !/function\s+labelMerit/.test(src),
  );
  ck(
    "2.9 the workspace does not import describeTrust or publicTrustLevel directly",
    !src.includes("describeTrust") && !src.includes("publicTrustLevel"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3 · ONE LIFECYCLE POLICY, ONE GROUP PER MERIT
   ══════════════════════════════════════════════════════════════════════ */
group("3 · a merit is in exactly one group, under the shared lifecycle policy");

{
  const states: LifecycleState[] = [
    "draft",
    "active",
    "expired",
    "revoked",
    "superseded",
    "disputed",
  ];
  ck(
    "3.1 every lifecycle state is current, unfinished or archived — exactly one",
    states.every(
      (s) =>
        [isCurrentMerit(s), isUnfinishedMerit(s), isArchivedMerit(s)].filter(Boolean).length === 1,
    ),
  );

  const w = build({
    claims: states.map((s, i) =>
      claim({ id: `c-${s}`, lifecycleState: s, issuedOn: `2024-01-0${i + 1}` }),
    ),
    periods: [period()],
    requests: [request({ claimId: "c-active", status: "pending" })],
  });
  const { current, inReview, archived, drafts } = w.groups;
  const all = [...current, ...inReview, ...archived, ...drafts];
  ck("3.2 every merit lands in a group", all.length === states.length + 1, String(all.length));
  ck(
    "3.3 and in only one",
    new Set(all.map((m) => m.id)).size === all.length,
    all.map((m) => m.id).join(","),
  );
  ck("3.4 the draft is in drafts and nowhere else", drafts.map((m) => m.id).join() === "c-draft");
  ck(
    "3.5 the four archived states are archived",
    archived
      .map((m) => m.id)
      .sort()
      .join() === "c-disputed,c-expired,c-revoked,c-superseded",
    archived.map((m) => m.id).join(),
  );
  ck(
    "3.6 the open review moves its merit out of the current group",
    inReview.map((m) => m.id).join() === "c-active" && !current.some((m) => m.id === "c-active"),
  );

  // The renderer shows no empty category.
  const markup = html(build({ periods: [period()] }));
  ck(
    "3.7 a Passport with one merit renders no in-review, archived or drafts group",
    !markup.includes('data-merit-group="in-review"') &&
      !markup.includes('data-merit-group="archived"') &&
      !markup.includes('data-merit-group="drafts"'),
  );
  ck("3.8 and does render the current group", markup.includes('data-merit-group="current"'));
}

{
  // A merit that is asking the holder for something leads its group, so the
  // list is ordered by what it wants rather than by when it was entered.
  const w = build({
    claims: [
      claim({ id: "c-new", issuedOn: "2026-08-01" }),
      claim({ id: "c-ask", issuedOn: "2020-01-01" }),
    ],
    requests: [request({ claimId: "c-ask", status: "clarification_requested" })],
  });
  ck(
    "3.9 the merit waiting on the holder is first in its group",
    w.groups.current[0]?.id === "c-ask" && meritNeedsHolder(w.groups.current[0]!),
    w.groups.current.map((m) => m.id).join(),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4 · EXACTLY ONE STEP, AND IT RETIRES
   ══════════════════════════════════════════════════════════════════════ */
group("4 · one recommended step, from real rows, with a real retirement");

{
  const cases: readonly {
    name: string;
    workspace: Workspace;
    kind: WorkspaceStepKind | null;
    href?: string;
  }[] = [
    {
      name: "a reviewer's question",
      workspace: build({
        claims: [claim()],
        requests: [request({ claimId: "c-1", status: "clarification_requested" })],
      }),
      kind: "respond_to_clarification",
      href: "/passport/entry/claim/c-1",
    },
    {
      name: "a refusal",
      workspace: build({
        claims: [claim()],
        requests: [
          request({ claimId: "c-1", status: "rejected", decidedAt: "2026-09-02T09:00:00.000Z" }),
        ],
      }),
      kind: "review_verification_outcome",
      href: "/passport/entry/claim/c-1",
    },
    {
      name: "an unfinished merit",
      workspace: build({
        claims: [claim({ id: "c-draft", lifecycleState: "draft" })],
        periods: [period(), period({ id: "p-2" })],
      }),
      kind: "resume_draft_merits",
      href: "/passport/credentials/new",
    },
    {
      name: "a Passport holding one merit",
      workspace: build({ periods: [period()] }),
      kind: "add_more_merits",
      href: "/passport/information",
    },
    {
      name: "two merits nobody has reviewed",
      workspace: build({ periods: [period(), period({ id: "p-2" })] }),
      kind: "submit_passport_verification",
    },
  ];

  for (const c of cases) {
    ck(
      `4.1 ${c.name} → ${c.kind}`,
      c.workspace.nextStep?.kind === c.kind,
      c.workspace.nextStep?.kind,
    );
    if (c.href) ck(`4.2 ${c.name} lands on its object`, c.workspace.nextStep?.href === c.href);
    ck(
      `4.3 ${c.name} states what retires it`,
      (c.workspace.nextStep?.retiresWhen ?? "").length > 10,
    );
  }

  // A reviewer's question outranks a refusal, a draft and everything below.
  const both = build({
    claims: [
      claim({ id: "c-ask" }),
      claim({ id: "c-no" }),
      claim({ id: "c-d", lifecycleState: "draft" }),
    ],
    requests: [
      request({ id: "r1", claimId: "c-ask", status: "clarification_requested" }),
      request({
        id: "r2",
        claimId: "c-no",
        status: "rejected",
        decidedAt: "2026-09-02T09:00:00.000Z",
      }),
    ],
  });
  ck(
    "4.4 a question outranks a refusal and a draft",
    both.nextStep?.kind === "respond_to_clarification",
  );

  // Several of one kind open the region that lists them, not one entry.
  const several = build({
    claims: [claim({ id: "c-a" }), claim({ id: "c-b" })],
    requests: [
      request({ id: "r1", claimId: "c-a", status: "clarification_requested" }),
      request({ id: "r2", claimId: "c-b", status: "clarification_requested" }),
    ],
  });
  ck(
    "4.5 several questions open the attention region rather than guessing an entry",
    several.nextStep?.href === "/passport" && several.nextStep?.hash === "attention",
  );

  // NOTHING PASSIVE. An open review asks the holder for nothing, so it can
  // never be the recommended step.
  const waiting = build({
    claims: [claim()],
    periods: [period()],
    requests: [request({ claimId: "c-1", status: "pending" })],
  });
  ck(
    "4.6 an open review is never the recommended step",
    waiting.nextStep?.kind !== ("verification_requested" as WorkspaceStepKind),
  );

  // RETIREMENT IS REAL: make the stated condition true and the step is gone.
  const answered = build({
    claims: [claim()],
    periods: [period()],
    requests: [request({ claimId: "c-1", status: "pending" })],
  });
  ck(
    "4.7 answering a question retires respond_to_clarification",
    answered.nextStep?.kind !== "respond_to_clarification",
  );
  const finished = build({
    claims: [claim({ id: "c-1" })],
    periods: [period(), period({ id: "p-2" })],
  });
  ck(
    "4.8 finishing every draft retires resume_draft_merits",
    finished.nextStep?.kind !== "resume_draft_merits",
  );
  const twoMerits = build({ periods: [period(), period({ id: "p-2" })] });
  ck("4.9 a second merit retires add_more_merits", twoMerits.nextStep?.kind !== "add_more_merits");
  const allDecided = build({
    periods: [
      period({
        assertionLevel: "verified",
        verifierName: "Nordic Security AB",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2026-07-15",
      }),
      period({
        id: "p-2",
        assertionLevel: "verified",
        verifierName: "Nordic Security AB",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2026-07-15",
      }),
    ],
  });
  ck(
    "4.10 every merit decided retires submit_passport_verification, and NOTHING replaces it",
    allDecided.nextStep === null,
    allDecided.nextStep?.kind,
  );
  const calm = text(html(allDecided));
  ck(
    "4.11 the retired card is replaced by a statement, not by a standing demand",
    calm.includes(passportT("ws.next.clearTitle", "sv")),
  );

  // A GENERIC LABEL MAY NOT CARRY A SPECIFIC DESTINATION. "Lägg till merit"
  // pointing at the employment block is the same small lie the header CTA
  // used to tell: a person who came to record a course lands on a form for
  // a job. The step goes to the page that holds every way in; the chooser is
  // where a kind is picked.
  const addMore = build({ periods: [period()] }).nextStep;
  ck(
    "4.11a the generic add-merit step lands on the page, not on one form",
    addMore?.href === "/passport/information" && addMore?.hash === null,
    `${addMore?.href}#${addMore?.hash}`,
  );

  // A STANDING DESTINATION IS NOT A STEP. "Share your Passport" can never be
  // completed, so it must never be emitted as one — that is the permanent
  // loop this page is not allowed to grow.
  const ladder = code(read("src/lib/security-passport/workspace.ts"));
  ck(
    "4.12 no step is a standing destination",
    !/retiresWhen:\s*"never/i.test(ladder) && !ladder.includes('kind: "share_passport"'),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4B · FAIL CLOSED WHEN THE REVIEW STATE CANNOT BE READ
   ══════════════════════════════════════════════════════════════════════ */
group("4B · a merit that MAY be under review never reads as an ordinary one");

{
  // THE REGRESSION THE CORRECTION PASS WAS ASKED FOR: one actually pending
  // merit, one with a reviewer's question against it, one ordinary
  // self-reported merit — and then the verification read fails.
  const rows = {
    claims: [
      claim({ id: "c-pending", titleSv: "Under granskning", titleEn: "Under review" }),
      claim({ id: "c-ask", titleSv: "Har en fråga", titleEn: "Has a question" }),
      claim({ id: "c-plain", titleSv: "Vanlig uppgift", titleEn: "Ordinary entry" }),
    ],
    requests: [
      request({ id: "r-p", claimId: "c-pending", status: "pending" as const }),
      request({ id: "r-a", claimId: "c-ask", status: "clarification_requested" as const }),
    ],
  };

  const known = build(rows);
  const down = build({ ...rows, unavailable: true });

  // With the read answering, the three are three different things.
  ck(
    "4B.1 with the read answering, the three merits are distinguished",
    known.groups.inReview.some((m) => m.id === "c-pending") &&
      known.groups.current.find((m) => m.id === "c-ask")?.label === "clarification_needed" &&
      known.groups.current.find((m) => m.id === "c-plain")?.label === "added_by_you",
  );

  // ── NEGATIVE CONTROL ──────────────────────────────────────────────
  //
  // This is exactly what the derivation did before the correction: the
  // review sets were EMPTY because the read failed, and `labelMerit` was
  // asked with `openReview: false, clarificationOpen: false`. It answers
  // `added_by_you` — for a merit that is really pending. The assertions
  // below are therefore not vacuous: without the fix they fail.
  const asItWas = labelMerit(
    {
      assertionLevel: "self_declared",
      lifecycleState: "active",
      validUntil: null,
      verifierName: null,
      verificationMethod: null,
      subjectKind: "credential",
    },
    { openReview: false, clarificationOpen: false },
    NOW,
  );
  ck(
    "4B.2 NEGATIVE CONTROL: an empty review set really does yield `added_by_you`",
    asItWas === "added_by_you",
    asItWas,
  );

  // ── AND WHAT IT DOES NOW ──────────────────────────────────────────
  const byId = (id: string) =>
    [...down.groups.current, ...down.groups.inReview, ...down.groups.reviewUnknown].find(
      (m) => m.id === id,
    );
  for (const id of ["c-pending", "c-ask", "c-plain"]) {
    ck(
      `4B.3 ${id} reads as unknown, not as an ordinary registered merit`,
      byId(id)?.label === "unknown",
      byId(id)?.label,
    );
  }
  ck(
    "4B.4 none of them is placed in the current group",
    down.groups.current.length === 0,
    down.groups.current.map((m) => m.id).join(),
  );
  ck(
    "4B.5 nor falsely in the under-review group",
    down.groups.inReview.length === 0,
    down.groups.inReview.map((m) => m.id).join(),
  );
  ck(
    "4B.6 they are in their own group, which names the reason",
    down.groups.reviewUnknown.length === 3,
    String(down.groups.reviewUnknown.length),
  );
  ck("4B.7 the registered figure is null, never 3", down.status.registered === null);
  ck("4B.8 the in-review figure is null, never 0", down.status.inReview === null);

  const markup = html(down);
  const t = text(markup);
  ck(
    "4B.9 the rendered page puts them under the unknown heading",
    markup.includes('data-merit-group="review-unknown"') &&
      !markup.includes('data-merit-group="current"'),
  );
  ck(
    "4B.10 each row says the review status could not be read",
    (markup.match(/data-merit-status="unknown"/g) ?? []).length === 3,
  );
  ck(
    "4B.11 in words, not only in an attribute",
    t.includes(passportT("ws.merit.status.unknown", "sv")) &&
      t.includes(passportT("ws.merits.reviewUnknown", "sv")),
  );
  ck(
    "4B.12 and never calls any of them by the settled word",
    !t.includes(passportT("ws.merit.status.added_by_you", "sv")),
  );

  // ── INTRINSIC STANDINGS SURVIVE, BECAUSE THEY DO NOT DEPEND ON IT ──
  const mixedDown = build({
    claims: [
      claim({
        id: "c-doc",
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2026-06-01",
      }),
      claim({ id: "c-plain" }),
    ],
    periods: [
      period({
        assertionLevel: "verified",
        verifierName: "Nordic Security AB",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2026-07-15",
      }),
    ],
    unavailable: true,
  });
  ck(
    "4B.13 a document review is still Documented — it does not depend on the request table",
    mixedDown.status.documented === 1 &&
      mixedDown.groups.current.find((m) => m.id === "c-doc")?.label === "documented",
  );
  ck(
    "4B.14 a source confirmation is still Källbekräftad",
    mixedDown.status.sourceConfirmed === 1 &&
      mixedDown.groups.current.find((m) => m.id === "p-1")?.label === "verified",
  );
  ck(
    "4B.15 only the self-reported one moves to the unknown group",
    mixedDown.groups.reviewUnknown.map((m) => m.id).join() === "c-plain",
    mixedDown.groups.reviewUnknown.map((m) => m.id).join(),
  );
  ck("4B.16 and no step is recommended from any of it", mixedDown.nextStep === null);

  // The rule is stated as data, not scattered through the builders.
  const src = code(read("src/lib/security-passport/workspace.ts"));
  ck(
    "4B.17 the review-dependent labels are named in one list",
    src.includes("REVIEW_DEPENDENT") &&
      src.includes('"added_by_you"') &&
      src.includes('"document_provided"'),
  );
  ck(
    "4B.18 and documented / verified / expired are NOT on it",
    (() => {
      const i = src.indexOf("const REVIEW_DEPENDENT");
      const list = src.slice(i, src.indexOf("]", i));
      return (
        !list.includes('"documented"') &&
        !list.includes('"verified"') &&
        !list.includes('"expired"')
      );
    })(),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5 · UNKNOWN IS NOT ZERO, AND NOT "NOTHING TO DO"
   ══════════════════════════════════════════════════════════════════════ */
group("5 · a verification read that did not answer says so");

{
  const down = build({
    claims: [claim()],
    periods: [period()],
    unavailable: true,
  });
  ck("5.1 the workspace reports it as unavailable", down.unavailable);
  ck(
    "5.2 the review-derived figures are null, never 0",
    down.counts.pendingCount === null &&
      down.status.inReview === null &&
      down.status.registered === null,
  );
  ck("5.3 and no step is recommended", down.nextStep === null);

  const markup = html(down);
  ck(
    "5.4 the in-review tile renders 'unknown' rather than a figure",
    markup.includes('data-status-tile="in-review"') && markup.includes('data-count="unknown"'),
  );
  ck(
    '5.5 the card is in its own "unavailable" state',
    markup.includes('data-next-step="unavailable"'),
  );
  const t = text(markup);
  ck("5.6 and never says nothing is waiting", !t.includes(passportT("ws.next.clearTitle", "sv")));
  ck("5.7 the merits still render — one failed read is not the page", t.includes("Väktare"));

  // The UNAVAILABLE sentinel really does reach the derivation as unknown.
  ck(
    "5.8 the shared unavailable sentinel is not `clear`",
    VERIFICATION_ATTENTION_UNAVAILABLE.unavailable && !VERIFICATION_ATTENTION_UNAVAILABLE.clear,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   6 · NO CONTRADICTION WITH MY CAREER
   ══════════════════════════════════════════════════════════════════════ */
group("6 · the workspace ladder agrees with the career ladder");

{
  const SHARED: readonly WorkspaceStepKind[] = [
    "respond_to_clarification",
    "review_verification_outcome",
    "resume_draft_merits",
    "submit_passport_verification",
  ];
  const WORKSPACE_ONLY: readonly WorkspaceStepKind[] = ["add_more_merits"];

  for (const kind of SHARED) {
    ck(
      `6.1 ${kind} is a My Career action kind too`,
      Object.prototype.hasOwnProperty.call(ACTION_CLASSIFICATION, kind),
    );
  }
  for (const kind of WORKSPACE_ONLY) {
    ck(
      `6.2 ${kind} is workspace-only and therefore must be a suggestion`,
      !Object.prototype.hasOwnProperty.call(ACTION_CLASSIFICATION, kind),
    );
  }

  // Every emitted step keeps My Career's classification for the kinds they
  // share, and every workspace-only kind is a suggestion that ranks below
  // every non-suggestion.
  const emitted: readonly Workspace[] = [
    build({
      claims: [claim()],
      requests: [request({ claimId: "c-1", status: "clarification_requested" })],
    }),
    build({
      claims: [claim()],
      requests: [
        request({ claimId: "c-1", status: "rejected", decidedAt: "2026-09-02T09:00:00.000Z" }),
      ],
    }),
    build({
      claims: [claim({ id: "c-draft", lifecycleState: "draft" })],
      periods: [period(), period({ id: "p-2" })],
    }),
    build({ periods: [period()] }),
    build({ periods: [period(), period({ id: "p-2" })] }),
  ];
  const steps = emitted
    .map((w) => w.nextStep)
    .filter((s): s is NonNullable<typeof s> => s !== null);
  ck("6.3 all five branches emit a step", steps.length === 5, String(steps.length));

  for (const step of steps) {
    if ((SHARED as readonly string[]).includes(step.kind)) {
      ck(
        `6.4 ${step.kind} keeps My Career's classification`,
        step.classification ===
          ACTION_CLASSIFICATION[step.kind as keyof typeof ACTION_CLASSIFICATION],
        `${step.classification} vs ${ACTION_CLASSIFICATION[step.kind as keyof typeof ACTION_CLASSIFICATION]}`,
      );
    } else {
      ck(`6.5 ${step.kind} is a suggestion`, step.classification === "suggestion");
    }
  }

  const lowestNonSuggestion = Math.max(
    ...steps.filter((s) => s.classification !== "suggestion").map((s) => s.rank),
  );
  const highestWorkspaceOnly = Math.min(
    ...steps
      .filter((s) => (WORKSPACE_ONLY as readonly string[]).includes(s.kind))
      .map((s) => s.rank),
  );
  ck(
    "6.6 a workspace-only step can never outrank something somebody is waiting for",
    highestWorkspaceOnly > lowestNonSuggestion,
    `${highestWorkspaceOnly} vs ${lowestNonSuggestion}`,
  );

  // The two ladders open the same object for the same subject.
  ck(
    "6.7 meritHref and the ladder's subjectHref agree",
    meritHref("claim", "x") === subjectHref({ kind: "claim", id: "x" }) &&
      meritHref("experience", "y") === subjectHref({ kind: "experience", id: "y" }),
  );

  // The two ladders order the kinds they share the same way.
  const rankOf = (kind: WorkspaceStepKind) => steps.find((s) => s.kind === kind)!.rank;
  ck(
    "6.8 the shared kinds keep My Career's relative order",
    rankOf("respond_to_clarification") < rankOf("review_verification_outcome") &&
      rankOf("review_verification_outcome") < rankOf("resume_draft_merits") &&
      rankOf("resume_draft_merits") < rankOf("submit_passport_verification"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   7 · WHAT A READER ACTUALLY SEES
   ══════════════════════════════════════════════════════════════════════ */
group("7 · one heading, one dominant call, three real destinations");

{
  const w = build({
    claims: [claim({ id: "c-x" })],
    periods: [period()],
  });
  const markup = html(w);

  ck("7.1 exactly one H1", (markup.match(/<h1/g) ?? []).length === 1);
  ck("7.2 and it names the product", markup.includes(passportT("overview.title", "sv")));
  ck(
    "7.3 the lead is short — two lines, not a manual",
    passportT("ws.lead", "sv").length <= 190 && passportT("ws.lead", "en").length <= 190,
    `${passportT("ws.lead", "sv").length}/${passportT("ws.lead", "en").length}`,
  );

  // ONE dominant call while nothing is waiting: adding a merit.
  ck("7.4 the primary CTA is 'add a merit'", markup.includes('data-primary-cta="add-merit"'));

  // ── THE GENERIC VERB DOES NOT HIDE A SPECIFIC DESTINATION ─────────
  //
  // "Lägg till merit" used to be one link to the EMPLOYMENT block. A person
  // who came to record a course pressed a button that said neither and
  // landed on a form for a job.
  ck(
    "7.4a the add-merit control offers a choice rather than one hidden destination",
    markup.includes("data-add-merit-chooser"),
  );
  const addOptions = [...markup.matchAll(/data-add-merit="([a-z]+)"/g)].map((m) => m[1]!);
  ck(
    "7.4b it names the three real ways a merit is entered",
    addOptions.join() === "employment,education,credential",
    addOptions.join(),
  );
  const addHrefs = [...markup.matchAll(/data-add-merit="[a-z]+"[^>]*/g)].map((m) => m[0]);
  const hrefFor = (kind: string) =>
    /href="([^"]+)"/.exec(
      new RegExp(
        `<a[^>]*data-add-merit="${kind}"[^>]*>|<a[^>]*href="[^"]*"[^>]*data-add-merit="${kind}"`,
      ).exec(markup)?.[0] ?? "",
    )?.[1] ?? "";
  ck(
    "7.4c employment goes to the employment section",
    hrefFor("employment") === "/passport/information#sp-employment",
  );
  ck(
    "7.4d education goes to the education section",
    hrefFor("education") === "/passport/information#sp-education",
  );
  ck(
    "7.4e a credential goes to the credential form",
    hrefFor("credential") === "/passport/credentials/new",
  );
  ck("7.4f no option is unaccounted for", addHrefs.length === 3, String(addHrefs.length));
  // Both anchors have to EXIST on the page they point at, and that page has
  // to honour an arriving fragment at all — it renders its sections after
  // the browser has given up on one.
  const info = read("src/routes/_authenticated.passport.information.tsx");
  ck("7.4g #sp-employment exists on the information page", info.includes('id="sp-employment"'));
  ck("7.4h #sp-education exists on the information page", info.includes('"sp-education"'));
  ck(
    "7.4i and that page scrolls to an arriving fragment once its sections exist",
    info.includes("<ScrollToHashOnceReady />"),
  );
  ck(
    "7.5 and there is exactly one of them",
    (markup.match(/data-primary-cta=/g) ?? []).length === 1,
  );

  // When somebody IS waiting, the step takes the dominant treatment and the
  // header steps down — so there is still exactly one.
  const asked = html(
    build({
      claims: [claim()],
      requests: [request({ claimId: "c-1", status: "clarification_requested" })],
    }),
  );
  ck(
    "7.6 a reviewer's question takes the dominant treatment instead",
    (asked.match(/data-primary-cta=/g) ?? []).length === 0 &&
      asked.includes('data-next-step="respond_to_clarification"'),
  );

  // Every destination is a real route.
  const routes = [
    ["/passport/information", "src/routes/_authenticated.passport.information.tsx"],
    ["/passport/share", "src/routes/_authenticated.passport.share.tsx"],
    ["/passport/card", "src/routes/_authenticated.passport.card.tsx"],
    ["/my-career/cv", "src/routes/_authenticated.my-career.cv.index.tsx"],
    ["/passport/credentials/new", "src/routes/_authenticated.passport.credentials.new.tsx"],
    ["/passport/entry/claim/c-x", "src/routes/_authenticated.passport.entry.$kind.$entryId.tsx"],
  ] as const;
  for (const [href, file] of routes) {
    let exists = false;
    try {
      exists = read(file).length > 0;
    } catch {
      exists = false;
    }
    ck(`7.7 ${href} has a route file`, exists);
  }

  const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
  ck(
    "7.8 every rendered href points somewhere",
    hrefs.every((h) => h.startsWith("/")),
  );
  ck(
    "7.9 the three uses of a Passport are share, CV and the recipient's view",
    markup.includes('data-use-link="share"') &&
      markup.includes('data-use-link="cv"') &&
      markup.includes('data-use-link="card"'),
  );
  ck(
    "7.10 and there are no more than three of them",
    (markup.match(/data-use-link=/g) ?? []).length === 3,
  );

  ck(
    "7.11 the merits list is anchored and focusable for the career home's deep link",
    /id="merits"/.test(markup) &&
      /id="merits"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="merits"/.test(markup),
  );
  ck(
    "7.12 every merit row carries a link to that merit's own page",
    markup.includes(`href="${meritHref("claim", "c-x")}"`) &&
      markup.includes(`href="${meritHref("experience", "p-1")}"`),
  );
}

{
  // A merit shows what it is, whose it is, when, and how it stands.
  const w = build({ claims: [claim({ id: "c-x" })] });
  const t = text(html(w));
  ck("7.13 the row states the type", t.includes(passportT("claims.type.certification", "sv")));
  ck("7.14 the title", t.includes("Väktarutbildning grundkurs"));
  ck("7.15 the issuer", t.includes("BYA"));
  ck("7.16 the date", t.includes("2024-05-02"));
  ck("7.17 and the trust standing", t.includes(passportT("ws.merit.status.added_by_you", "sv")));

  // An unstated issuer says so in words rather than printing the sentinel.
  const dash = text(html(build({ claims: [claim({ id: "c-x", issuerName: "—" })] })));
  ck(
    "7.18 an unrecorded issuer says so rather than printing a dash",
    dash.includes(passportT("ws.merit.organisationUnknown", "sv")),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   7B · ONE CARD, AND THE REST IS A DOCUMENT
   ══════════════════════════════════════════════════════════════════════ */
group("7B · only the recommended step is a card");

{
  const w = build({
    claims: [claim({ id: "c-a" }), claim({ id: "c-b" })],
    periods: [period()],
  });
  const markup = html(w);

  // Attribute order in the rendered markup is React's, not the author's, so
  // every one of these reads the class list either side of the marker.
  const classesOf = (marker: string): string[] =>
    [...markup.matchAll(new RegExp(`<[a-z]+[^>]*${marker}[^>]*>`, "g"))]
      .map((m) => /class="([^"]*)"/.exec(m[0])?.[1] ?? "")
      .filter((c) => c !== "");

  // A merit is a ROW in a list, not a card: no border and no surface of its
  // own. The list carries the hairlines.
  const rows = classesOf('data-merit-row="[^"]*"');
  ck("7B.1 every merit row was found", rows.length === 3, String(rows.length));
  ck(
    "7B.2 no merit row draws its own border",
    rows.every((c) => !/(^|\s)border(\s|-|$)/.test(c)),
    rows.find((c) => /(^|\s)border(\s|-|$)/.test(c)),
  );
  ck(
    "7B.3 nor its own surface",
    rows.every((c) => !/\bbg-card\b/.test(c)),
  );
  ck(
    "7B.4 the list separates them with hairlines instead",
    (markup.match(/divide-y divide-border/g) ?? []).length > 0,
  );

  // The status overview is ONE band, not four boxes.
  const tiles = classesOf('data-status-tile="[^"]*"');
  ck("7B.5 all four figures were found", tiles.length === 4, String(tiles.length));
  ck(
    "7B.6 no figure is its own bordered card",
    tiles.every((c) => !/(^|\s)border(\s|-|$)/.test(c) && !/\bbg-card\b/.test(c)),
    tiles.find((c) => /(^|\s)border(\s|-|$)/.test(c)),
  );

  // Nothing in the CONTENT FLOW is elevated except the recommended step. The
  // add-merit chooser's panel is elevated too and is meant to be: it floats
  // above the page while it is open, and it is not part of the flow.
  const useLinks = classesOf('data-use-link="[^"]*"');
  ck("7B.7 the three uses were found", useLinks.length === 3, String(useLinks.length));
  ck(
    "7B.8 no merit row, figure or use link is elevated",
    [...rows, ...tiles, ...useLinks].every((c) => !/\bshadow-/.test(c)),
  );
  const stepCard = /<article[^>]*class="([^"]*)"/.exec(
    markup.slice(markup.indexOf("data-next-step=")),
  )?.[1];
  ck(
    "7B.9 and the recommended step is the one element that is",
    Boolean(stepCard && /\bshadow-/.test(stepCard)),
    stepCard,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   8 · BOTH LANGUAGES, ALL THE WAY DOWN
   ══════════════════════════════════════════════════════════════════════ */
group("8 · Swedish and English are both complete");

{
  const w = build({
    claims: [
      claim({
        id: "c-doc",
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2026-06-01",
      }),
    ],
    periods: [period()],
  });

  const en = text(html(w, "en"));
  const sv = text(html(w, "sv"));

  ck(
    "8.1 the English page uses the English title",
    en.includes("Security officer foundation course"),
  );
  ck("8.2 and never falls back to the Swedish one", !en.includes("Väktarutbildning grundkurs"));
  ck("8.3 the Swedish page uses the Swedish title", sv.includes("Väktarutbildning grundkurs"));

  const swedishWords = [
    passportT("overview.title", "sv"),
    passportT("ws.status.registered", "sv"),
    passportT("ws.status.sourceConfirmed", "sv"),
    passportT("ws.merits.title", "sv"),
    passportT("ws.use.title", "sv"),
  ];
  ck(
    "8.4 no Swedish workspace string leaks into the English page",
    swedishWords.every((word) => !en.includes(word)),
    swedishWords.find((word) => en.includes(word)),
  );

  const englishWords = [
    passportT("ws.status.registered", "en"),
    passportT("ws.merits.title", "en"),
    passportT("ws.use.title", "en"),
  ];
  ck(
    "8.5 nor the other way round",
    englishWords.every((word) => !sv.includes(word)),
    englishWords.find((word) => sv.includes(word)),
  );

  // The attention list carried Swedish titles into an English page until
  // PR #196. Both languages are on the item now.
  const attention = code(read("src/lib/security-passport/attention.ts"));
  ck("8.6 an attention item carries both languages", attention.includes("titleEn"));
  const panel = code(read("src/components/security-passport/AttentionPanel.tsx"));
  ck(
    "8.7 and the panel picks by language",
    panel.includes('lang === "sv" ? item.title : item.titleEn'),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   9 · THE PAGE STRUCTURE, PINNED
   ══════════════════════════════════════════════════════════════════════ */
group("9 · the route wires it, and nothing else decides trust");

{
  const route = code(read("src/routes/_authenticated.passport.index.tsx"));

  ck("9.1 the route renders the workspace", route.includes("<PassportWorkspace"));
  ck(
    "9.2 and derives it with buildPassportWorkspace rather than deciding for itself",
    route.includes("buildPassportWorkspace("),
  );
  ck(
    "9.3 the first run still owns an empty Passport",
    route.includes("deriveFirstRunState") && route.includes('firstRun.screen !== "overview"'),
  );
  ck(
    "9.4 the hand-off is a replace, so Back does not loop",
    /to: "\/passport\/onboarding", replace: true/.test(route),
  );
  ck(
    "9.5 the two reads are independent — a failed verification read is caught on its own",
    /refreshVerification[\s\S]{0,600}catch/.test(route) &&
      !/Promise\.all\(\[[\s\S]*?loadRequests/.test(route),
  );
  ck(
    "9.6 a failed verification read reaches the derivation as UNKNOWN, not as empty",
    route.includes("attention.unavailable ? null : attention"),
  );
  ck(
    "9.7 the attention region is still the career home's deep-link target",
    route.includes('id="attention"') && route.includes('aria-labelledby="attention-heading"'),
  );

  const component = code(read("src/components/security-passport/PassportWorkspace.tsx"));
  // ── THE COMPONENT CANNOT REACH A TRUST FIELD ───────────────────────
  //
  // Not "does not today": the three stored trust columns do not appear in it
  // at all, so there is nothing for a future edit to branch on. The status
  // word it prints is `merit.label`, which the shared labeller decided.
  // Lifecycle IS read — an archived row wears its lifecycle word — and that
  // is a presentation choice over a field nothing here can move.
  ck(
    "9.8 the component never touches a stored trust field",
    !/assertionLevel|verificationMethod|verifierName|verifiedOn/.test(component),
  );
  ck(
    "9.9 and prints the shared label rather than deriving one",
    component.includes("STATUS_KEY[") && component.includes("merit.label"),
  );
  ck(
    "9.10 it renders no completion percentage or score",
    !/%\s*(complete|klar)/i.test(component) && !/completeness|score/i.test(component),
  );
  ck("9.11 the derivation is versioned", PASSPORT_WORKSPACE_VERSION === "passport-workspace-v1");
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`passport-workspace-check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-workspace-check OK");
