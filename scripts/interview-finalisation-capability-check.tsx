/**
 * Finalisation capability — does the screen tell the truth about who may lock
 * a candidate interview report?
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────
 *
 * A pilot walkthrough reached the report screen. It said "Inget hindrar
 * rapporten" and rendered an active "Slutför rapporten" button. The user
 * clicked. The database refused:
 *
 *   SCP_IV_FINALISE_ROLE: finalising a candidate interview report requires an
 *   employer owner or admin.
 *
 * The rule was right. The screen was not, and the only way to find out was to
 * try. This guard exists so that cannot come back.
 *
 * ── WHAT IT PROVES, AND HOW ────────────────────────────────────────────
 *
 * RENDER   Both branches of ReportFinalisation are actually drawn, in both
 *          languages, and read for what is present AND what is absent. "The
 *          member sees no button" is the assertion that matters, and only a
 *          render can make it.
 *
 * SOURCE   That the backend rule is untouched, that the route gates on the
 *          shared capability rather than on something it happened to have
 *          nearby, and that blockers still take precedence.
 *
 * The DIRECT RPC refusal — a member calling scp_iv_finalise_report anyway — is
 * not here. It is a claim about the database, not the source, and it lives in
 * scripts/interview-finalisation-rpc-check.ts where it can be executed.
 *
 * Deterministic, offline, no database.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The same substitute, and for the same reason, as candidate-app-navigation
// and my-career-experience: <Link> needs a live router and does not render
// synchronously under renderToStaticMarkup. Params are resolved faithfully so
// the href proved here is the href a recruiter clicks -- which matters,
// because "there is somewhere to go next" is one of the things this asserts.
//
// The mock must be installed BEFORE the component is loaded, hence the dynamic
// imports below.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { ReportFinalisation } =
  await import("../src/components/employer/interview/ReportFinalisation");
const { canFinaliseInterviewReport, REPORT_FINALISE_ROLES } =
  await import("../src/lib/interview-intelligence/capability");
const { dictionaries } = await import("../src/i18n/dictionaries");

const root = process.cwd();
let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Source with comments stripped, so a guard never trips on prose that
 *  explains the rule it is checking. Every file here discusses the roles at
 *  length in order to justify them. */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
const COMPONENT = "src/components/employer/interview/ReportFinalisation.tsx";
const RUNTIME_MIGRATION = "supabase/migrations/20260920090000_scp_interview_runtime.sql";

console.log("interview-finalisation-capability-check\n");

/* ================================================================== */
/* The capability function                                             */
/* ================================================================== */

ok(canFinaliseInterviewReport("owner"), "owner may finalise");
ok(canFinaliseInterviewReport("admin"), "admin may finalise");
ok(!canFinaliseInterviewReport("member"), "member may NOT finalise");

// A screen that has not yet established who somebody is must not offer them an
// irreversible action. Both absent shapes answer false.
ok(!canFinaliseInterviewReport(null), "an unresolved role may NOT finalise");
ok(!canFinaliseInterviewReport(undefined), "a missing role may NOT finalise");

ok(REPORT_FINALISE_ROLES.length === 2, "exactly two roles may finalise");
ok(
  REPORT_FINALISE_ROLES.includes("owner") && REPORT_FINALISE_ROLES.includes("admin"),
  "the two roles are owner and admin",
);

/* ================================================================== */
/* Render — the two branches, in both languages                        */
/* ================================================================== */

/** The I18nProvider defaults to Swedish on the server. English is rendered by
 *  reading the dictionary directly for the strings that must differ, because a
 *  guard that only ever reads one language proves parity of nothing. */
const render = (canFinalise: boolean) =>
  renderToStaticMarkup(
    <I18nProvider>
      <ReportFinalisation
        canFinalise={canFinalise}
        onFinalise={() => {}}
        isPending={false}
        employerSlug="test-employer"
        caseId="00000000-0000-4000-8000-000000000001"
      />
    </I18nProvider>,
  );

const ownerMarkup = render(true);
const memberMarkup = render(false);

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

// ── A / B · owner and admin see the finalise control ────────────────
ok(ownerMarkup.includes(sv["iiu.rp.finalise"]), "A/B · the finalise button is rendered for owner");
ok(ownerMarkup.includes("<button"), "A/B · it is a real button, not a link or a label");
// The HTML ATTRIBUTE, not Tailwind's `disabled:` variant -- PRIMARY_BUTTON
// carries `disabled:opacity-...`, so a bare /disabled/ matches the class list
// and would pass or fail for the wrong reason.
const hasDisabledAttr = (markup: string) => /<button[^>]*\sdisabled(?:[=\s>])/.test(markup);
ok(!hasDisabledAttr(ownerMarkup), "A/B · and it is not disabled when idle");
ok(
  ownerMarkup.includes(sv["iiu.rp.confirm"]),
  "A/B · the irreversibility confirmation is shown with it",
);

// ── C · an ordinary member sees NO actionable finalise control ──────
//
// The load-bearing assertion of this whole file.
ok(!memberMarkup.includes("<button"), "C · the member branch renders no button at all");
ok(
  !memberMarkup.includes(sv["iiu.rp.finalise"]),
  "C · the member is not shown the finalise wording",
);
ok(
  !memberMarkup.includes(sv["iiu.rp.confirm"]),
  "C · nor the confirmation that belongs to the action",
);

// A DISABLED button would be the same false claim in a quieter voice: it still
// says "this was yours to do, and something is wrong".
ok(!hasDisabledAttr(memberMarkup), "C · and no disabled control either");

// ── D · the member is told what IS true ─────────────────────────────
ok(
  memberMarkup.includes(sv["iiu.rp.await.title"]),
  "D · the member sees the ready-for-approval state",
);
ok(
  memberMarkup.includes("ägare eller administratör"),
  "D · and is told an owner or administrator must approve it",
);
ok(memberMarkup.includes(sv["iiu.rp.await.back"]), "D · with a route back, not a dead end");

// Not an error state. A person who did everything right and finished their part
// must not have the end of their work coloured as a problem, and must not be
// shown an alert before anything has failed.
ok(!/role="alert"/.test(memberMarkup), "D · the waiting state is not an alert");
ok(
  !/\b(destructive|text-red|border-red|bg-red)\b/.test(memberMarkup),
  "D · the waiting state uses no error colour",
);
// The amber treatment is reserved for the irreversible action and for
// blockers. The waiting state is neither.
ok(!/amber/.test(memberMarkup), "D · the waiting state uses no warning colour");
ok(/amber/.test(ownerMarkup), "D · while the irreversible action still carries its warning");

// ── Pending ────────────────────────────────────────────────────────
const pendingMarkup = renderToStaticMarkup(
  <I18nProvider>
    <ReportFinalisation
      canFinalise
      onFinalise={() => {}}
      isPending
      employerSlug="e"
      caseId="00000000-0000-4000-8000-000000000001"
    />
  </I18nProvider>,
);
ok(hasDisabledAttr(pendingMarkup), "· the button is disabled while the call is in flight");
ok(pendingMarkup.includes(sv["iiu.rp.finalising"]), "· and says so");

/* ================================================================== */
/* E · the backend rule is untouched                                   */
/* ================================================================== */

// EVERY definition, across every migration -- and the checks run on the
// NEWEST one.
//
// A later CREATE OR REPLACE somewhere else is how a rule silently loosens: the
// newest definition is the one that runs, and a guard reading only the
// original would keep passing while the rule it checks no longer exists. So
// this collects every definition in filename (= apply) order, asserts the rule
// on the LAST of them, and asserts that no definition in the history ever
// dropped it. 20261020090000 (evidence reliability) legitimately redefines the
// function to make finalising idempotent; the boundary travelled with it.
const migrationFiles = readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const definitions: Array<{ file: string; body: string }> = [];
for (const f of migrationFiles) {
  const sql = read(path.join("supabase/migrations", f));
  const re = /CREATE OR REPLACE FUNCTION public\.scp_iv_finalise_report/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    definitions.push({ file: f, body: sql.slice(m.index) });
  }
}
ok(
  definitions.length >= 1 && definitions[0].file === path.basename(RUNTIME_MIGRATION),
  "E · scp_iv_finalise_report is first defined by the runtime migration",
);
ok(
  definitions.length === 2 &&
    definitions[1].file === "20261020090000_scp_interview_evidence_reliability.sql",
  `E · every redefinition of scp_iv_finalise_report is a known, reviewed one (found ${definitions.length})`,
);
const finaliseFn = definitions[definitions.length - 1].body;

for (const def of definitions) {
  const head = def.body.slice(0, 2000);
  ok(
    /has_employer_role\(\s*\n?\s*auth\.uid\(\),\s*_c\.employer_id,\s*ARRAY\['owner','admin'\]\)/.test(
      head,
    ),
    `E · ${def.file}: scp_iv_finalise_report requires owner or admin`,
  );
  ok(
    def.body.includes("SCP_IV_FINALISE_ROLE"),
    `E · ${def.file}: and raises SCP_IV_FINALISE_ROLE when it is not met`,
  );
  ok(
    head.includes("insufficient_privilege"),
    `E · ${def.file}: with an insufficient_privilege errcode`,
  );
  // The role check must come BEFORE the blockers check, so a member cannot
  // learn anything about a case's readiness by probing the finalise call.
  const rolePos = def.body.indexOf("SCP_IV_FINALISE_ROLE");
  const blockPos = def.body.indexOf("SCP_IV_REPORT_BLOCKED");
  ok(
    rolePos > 0 && blockPos > rolePos,
    `E · ${def.file}: the role check precedes the blocker check`,
  );
}
void finaliseFn;

/* ================================================================== */
/* The route gates on the shared capability                            */
/* ================================================================== */

const routeSource = codeOnly(read(ROUTE));

ok(
  routeSource.includes("canFinaliseInterviewReport(ws.workspace.role)"),
  "· the route derives capability from the caller's own membership role",
);
ok(
  routeSource.includes("<ReportFinalisation"),
  "· and renders the finalisation block through the component that gates it",
);

// The button must not be reachable from anywhere else on the page.
const componentSource = codeOnly(read(COMPONENT));
ok(
  !routeSource.includes("finalise.mutate()") ||
    /onFinalise=\{\(\) => finalise\.mutate\(\)\}/.test(routeSource),
  "· the only call site of finalise.mutate is the gated component's prop",
);
ok(
  (routeSource.match(/finalise\.mutate\(\)/g) ?? []).length === 1,
  "· and there is exactly one of them",
);

// Capability must not be inferred from anything other than the role.
for (const wrong of ["createdBy", "created_by", "isOwnCase", "d.employerId ===", "caseId ==="]) {
  ok(!componentSource.includes(wrong), `· capability is not inferred from ${wrong}`);
}

/* ================================================================== */
/* F · blockers still take precedence                                  */
/* ================================================================== */

// The finalisation block renders only inside the `blockers.length === 0`
// branch. A ready-looking control above an unmet blocker would be the same
// class of lie this guard exists about.
const readyBranch = routeSource.indexOf("d.blockers.length === 0");
const finalisationBlock = routeSource.indexOf("<ReportFinalisation");
// Anchored on the blocker LIST render, not on the first mention of the code:
// `unassessed` is derived near the top of the component and would put this
// index above the finalisation block for a reason that says nothing.
const blockerList = routeSource.indexOf('b.code !== "QUESTION_NOT_ASSESSED"');
ok(readyBranch > 0, "F · the report screen still branches on blockers");
ok(
  finalisationBlock > readyBranch && finalisationBlock < blockerList,
  "F · finalisation renders only in the no-blockers branch",
);

/* ================================================================== */
/* G · a finalised report is unaffected                                */
/* ================================================================== */

// The whole remaining-work section, finalisation included, is behind
// `!isFinal`. Nothing here can redraw or reopen a locked report.
ok(routeSource.includes("{!isFinal && ("), "G · the remaining-work section is behind !isFinal");
const notFinalPos = routeSource.indexOf("{!isFinal && (");
ok(notFinalPos > 0 && notFinalPos < finalisationBlock, "G · and finalisation sits inside it");

/* ================================================================== */
/* Errors are surfaced, never swallowed                                */
/* ================================================================== */

ok(
  routeSource.includes("finalise.isError"),
  "· a refusal after an attempt is still rendered as an error",
);
ok(
  /finalise\.isError[\s\S]{0,400}role="alert"/.test(routeSource),
  "· as a real alert, so an owner/admin sees a genuine backend disagreement",
);
// And it is rendered from the backend's own message rather than a generic one.
ok(
  /finalise\.isError[\s\S]{0,400}interviewErrorMessage\(finalise\.error/.test(routeSource),
  "· carrying what the backend actually said",
);

/* ================================================================== */
/* H · SV / EN parity                                                  */
/* ================================================================== */

const NEW_KEYS = [
  "iiu.rp.ready.title",
  "iiu.rp.await.title",
  "iiu.rp.await.body",
  "iiu.rp.await.back",
];

for (const key of NEW_KEYS) {
  ok(typeof sv[key] === "string" && sv[key].trim() !== "", `H · ${key} exists in Swedish`);
  ok(typeof en[key] === "string" && en[key].trim() !== "", `H · ${key} exists in English`);
  ok(sv[key] !== en[key], `H · ${key} is genuinely translated`);
}

// The English copy has to carry the same load-bearing sentence.
ok(
  /owner or administrator/i.test(en["iiu.rp.await.body"]),
  "H · the English body names who must approve",
);
ok(/ägare eller administratör/i.test(sv["iiu.rp.await.body"]), "H · and so does the Swedish");

// The ambiguous title is gone from both, and from the source.
ok(!("iiu.rp.noblockers.title" in sv), "H · the ambiguous Swedish title is retired");
ok(!("iiu.rp.noblockers.title" in en), "H · and the English one");
ok(!read(ROUTE).includes("iiu.rp.noblockers.title"), "H · and nothing still references it");

// Readiness copy must describe the MATERIAL, not the reader's authority. A
// title that says "nothing is blocking" invites the reader to conclude the
// matter is theirs to close.
for (const [lang, dict] of [
  ["sv", sv],
  ["en", en],
] as const) {
  const title = dict["iiu.rp.ready.title"].toLowerCase();
  ok(
    !/hindrar|blocking|klar att slutföra|ready to complete/.test(title),
    `H · the ${lang} readiness title claims completeness, not permission`,
  );
}

/* ================================================================== */

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
