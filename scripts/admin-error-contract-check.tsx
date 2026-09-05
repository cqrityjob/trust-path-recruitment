// The Admin Portal must never show an admin an identifier.
//
// Run via `bun run admin-error-contract:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// A platform admin cancelled a test assignment and the dialog answered:
//
//     ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED
//
// Five unrelated conditions could produce that string -- three refusals inside
// admin_cancel_assessment_assignment() and two table constraints reached from
// its UPDATE -- because all five raise SQLSTATE 23514 and the server function
// mapped that one SQLSTATE to that one constant, which the route rendered
// verbatim. Nobody could tell "type a reason" from "this one is finished".
//
// The fix has three halves that drift independently, which is exactly the shape
// of failure that produced the original report:
//
//     * the SQL raises a stable identifier per condition   (a migration)
//     * the client maps every identifier to a translation key   (admin-error.ts)
//     * both dictionaries carry copy for every key         (dictionaries.ts)
//
// Somebody adds a RAISE to the SQL and never touches the map; somebody adds a
// code and never writes the Swedish. Either one puts an identifier back on
// screen. This guard fails the build for both.
//
// It also pins the two numbers and the one list that are necessarily stated
// more than once -- the 2000-character ceiling and the cancellable status set --
// because a frontend that disagrees with the backend about those is how an
// action gets offered that cannot succeed.
//
// Credential-free and network-free, like every other guard in this repository.

import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dictionaries } from "../src/i18n/dictionaries";
import { I18nProvider, LanguageScope } from "../src/i18n/context";
import { AdminActionError } from "../src/components/admin/AdminActionError";
import {
  ADMIN_ERROR_CODES,
  ADMIN_ERROR_COPY,
  CANCELLABLE_ASSIGNMENT_STATUSES,
  CANCELLATION_REASON_MAX,
  adminErrorCode,
} from "../src/lib/admin/admin-error";

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Several assertions below deliberately feed unmapped errors through the
 *  layer, which logs them. Captured rather than printed: it keeps the CI output
 *  readable, and it lets the guard assert that the detail an engineer needs is
 *  actually written somewhere -- discarding it is how the employer decision
 *  panel's original defect became unrecoverable. */
function capturingConsole<T>(fn: () => T): { result: T; logged: string[] } {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    return { result: fn(), logged };
  } finally {
    console.error = original;
  }
}

/** Assertion E forbids `.message` in the error handler, and the comments that
 *  explain why necessarily write `e.message`. Comments come out first, or the
 *  guard fails on its own rationale -- the same trap employer-decision-error-
 *  check.ts documents. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const MIGRATION = "supabase/migrations/20261028090000_admin_cancel_assignment_error_contract.sql";
const ADMIN_ERROR = "src/lib/admin/admin-error.ts";
const SERVER_FN = "src/lib/job-intelligence/admin-assessment-assignments.functions.ts";
const ROUTE = "src/routes/_authenticated.admin.assignments.$assignmentId.tsx";
const PRESENTER = "src/components/admin/AdminActionError.tsx";

// ---------------------------------------------------------------------------
// A. Every refusal the SQL can raise is one the client can name.
// ---------------------------------------------------------------------------
{
  const sql = read(MIGRATION);
  const raised = [...new Set([...sql.matchAll(/\bADMIN_CANCEL_[A-Z_]+\b/g)].map((m) => m[0]))]
    // The migration's own proof block asserts on its source text and on failure
    // paths of its own; those are not refusals the client will ever see.
    .filter((id) => !id.startsWith("ADMIN_CANCEL_CONTRACT_"))
    .filter((id) => id !== "ADMIN_CANCEL_ERROR_CONTRACT_PROOF");

  expect(
    raised.length >= 7,
    `expected at least 7 distinct ADMIN_CANCEL_* refusals in ${MIGRATION}, found ${raised.length} (${raised.join(", ")}) -- the whole point is that each condition is separately identifiable`,
  );

  const map = read(ADMIN_ERROR);
  for (const id of raised) {
    expect(
      map.includes(`${id}:`),
      `${id} is raised by ${MIGRATION} but has no entry in ${ADMIN_ERROR} -- an admin would be shown the identifier`,
    );
    // Proven by running the normaliser, not by reading the file: a listed key
    // that resolves to unknown_error is not actually mapped.
    const { code } = adminErrorCode(new Error(id));
    expect(
      code !== "unknown_error",
      `${id} is raised by ${MIGRATION} but adminErrorCode() resolves it to unknown_error`,
    );
  }
}

// ---------------------------------------------------------------------------
// B. Every code has copy, in both languages.
// ---------------------------------------------------------------------------
for (const code of ADMIN_ERROR_CODES) {
  const key = ADMIN_ERROR_COPY[code];
  expect(Boolean(key), `admin error code "${code}" has no entry in ADMIN_ERROR_COPY`);
  if (!key) continue;
  expect(
    typeof sv[key] === "string" && sv[key].trim().length > 0,
    `admin error code "${code}" -> "${key}" has no Swedish copy`,
  );
  expect(
    typeof en[key] === "string" && en[key].trim().length > 0,
    `admin error code "${code}" -> "${key}" has no English copy`,
  );
}

// The unknown case must quote the code, in both languages -- that is the only
// thing a person on a support call can give us. It is also the ONLY copy string
// allowed to carry an identifier.
for (const [lang, dict] of [
  ["sv", sv],
  ["en", en],
] as const) {
  const key = ADMIN_ERROR_COPY.unknown_error;
  expect(
    (dict[key] ?? "").includes("{code}"),
    `${lang} copy for unknown_error must contain the {code} placeholder, or an unrecognised failure becomes unreportable`,
  );
}

// No OTHER copy string may contain a SCREAMING_SNAKE identifier or a SQLSTATE.
for (const code of ADMIN_ERROR_CODES) {
  if (code === "unknown_error") continue;
  const key = ADMIN_ERROR_COPY[code];
  for (const [lang, dict] of [
    ["sv", sv],
    ["en", en],
  ] as const) {
    const copy = dict[key] ?? "";
    expect(
      !/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(copy) && !/\b\d{5}\b/.test(copy),
      `${lang} copy for "${code}" looks like it contains an identifier or SQLSTATE: ${copy}`,
    );
  }
}

// ---------------------------------------------------------------------------
// C. The frontend and the backend agree on which statuses are cancellable.
// ---------------------------------------------------------------------------
{
  const sql = read(MIGRATION);
  const match = /_current_status NOT IN \(([^)]*)\)/.exec(sql);
  expect(Boolean(match), `could not find the cancellable status list in ${MIGRATION}`);
  if (match) {
    const fromSql = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const fromTs = [...CANCELLABLE_ASSIGNMENT_STATUSES].sort();
    expect(
      JSON.stringify(fromSql) === JSON.stringify(fromTs),
      `the cancellable statuses disagree -- SQL says [${fromSql.join(", ")}], CANCELLABLE_ASSIGNMENT_STATUSES says [${fromTs.join(", ")}]. The button would be offered where the backend refuses, or withheld where it would succeed.`,
    );
  }

  // And the route must gate on the shared constant rather than restating it.
  const route = stripComments(read(ROUTE));
  expect(
    route.includes("CANCELLABLE_ASSIGNMENT_STATUSES"),
    `${ROUTE} must derive its cancellable set from CANCELLABLE_ASSIGNMENT_STATUSES, not from its own literal`,
  );
}

// ---------------------------------------------------------------------------
// D. One reason ceiling, enforced in three places.
// ---------------------------------------------------------------------------
{
  const sql = read(MIGRATION);
  expect(
    sql.includes(`char_length(_clean_reason) > ${CANCELLATION_REASON_MAX}`),
    `the SQL reason ceiling does not match CANCELLATION_REASON_MAX (${CANCELLATION_REASON_MAX})`,
  );
  const fn = stripComments(read(SERVER_FN));
  expect(
    fn.includes("max(CANCELLATION_REASON_MAX)"),
    `${SERVER_FN}'s cancel schema must bound the reason with CANCELLATION_REASON_MAX, not a literal`,
  );
  const route = stripComments(read(ROUTE));
  expect(
    route.includes("CANCELLATION_REASON_MAX"),
    `${ROUTE} must validate the reason length against CANCELLATION_REASON_MAX before submitting -- otherwise the ceiling is discovered only as a failed request`,
  );
}

// ---------------------------------------------------------------------------
// E. The cancellation path renders no raw error.
// ---------------------------------------------------------------------------
{
  const route = stripComments(read(ROUTE));
  expect(
    !/\.message/.test(route),
    `${ROUTE} still reads an error's .message -- that is what put ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED on screen`,
  );
  expect(
    route.includes("<AdminActionError"),
    `${ROUTE} must render failures through <AdminActionError />`,
  );

  const fn = stripComments(read(SERVER_FN));
  expect(
    !fn.includes("23514"),
    `${SERVER_FN} must not branch on SQLSTATE 23514 -- five unrelated conditions raise it, which is the defect this contract exists to prevent`,
  );
  expect(
    !fn.includes("ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED"),
    `${SERVER_FN} must not throw the combined identifier any more`,
  );
  expect(
    fn.includes("adminFail("),
    `${SERVER_FN} must route RPC failures through adminFail() so an unrecognised database message is logged and replaced`,
  );

  // The presenter is the only place allowed to put an identifier in the DOM,
  // and only for the unknown case.
  const presenter = stripComments(read(PRESENTER));
  expect(
    presenter.includes('code === "unknown_error" ? copy.replace("{code}", raw)'),
    `${PRESENTER} must quote the raw identifier only for unknown_error`,
  );
}

// ---------------------------------------------------------------------------
// F. The normaliser behaves, proven by running it.
// ---------------------------------------------------------------------------
{
  const cases: [unknown, string][] = [
    [new Error("ADMIN_CANCEL_REASON_REQUIRED"), "cancellation_reason_required"],
    [new Error("ADMIN_CANCEL_REASON_TOO_LONG"), "cancellation_reason_too_long"],
    [new Error("ADMIN_CANCEL_NOT_CANCELLABLE"), "assignment_not_cancellable"],
    [new Error("ADMIN_CANCEL_STATE_INCONSISTENT"), "assignment_state_inconsistent"],
    [new Error("ADMIN_CANCEL_NOT_FOUND"), "not_found"],
    [new Error("ADMIN_CANCEL_FORBIDDEN"), "permission_denied"],
    [new Error("FORBIDDEN_ADMIN_REQUIRED"), "permission_denied"],
    // A database that has not had 20261028090000 applied yet still answers with
    // the old combined identifier, and an admin must still get a sentence.
    [new Error("ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED"), "assignment_not_cancellable"],
    // The code property, for the path where a custom Error survives the
    // server boundary with its properties intact.
    [{ code: "ADMIN_CANCEL_NOT_CANCELLABLE" }, "assignment_not_cancellable"],
    // Anything unrecognised is a sentence plus a quotable code, never a crash.
    [new Error("some database wording nobody mapped"), "unknown_error"],
    [null, "unknown_error"],
    [new Error("TypeError: Failed to fetch"), "network_error"],
  ];
  for (const [input, expected] of cases) {
    const { code } = capturingConsole(() => adminErrorCode(input)).result;
    expect(
      code === expected,
      `adminErrorCode(${JSON.stringify(input instanceof Error ? input.message : input)}) returned "${code}", expected "${expected}"`,
    );
  }

  // The raw database wording must never come back as something renderable.
  const dump =
    'new row for relation "assessment_assignments" violates check constraint "assessment_assignments_person_context_agrees"';
  const probe = capturingConsole(() => adminErrorCode(new Error(dump)));
  const { code, raw } = probe.result;
  // Not quoted to the admin -- but not thrown away either.
  expect(
    probe.logged.some((line) => line.includes("person_context_agrees")),
    "the unmapped database wording must be logged for engineers, even though it is not shown",
  );
  expect(
    code === "unknown_error",
    "a raw constraint violation must resolve to unknown_error, not be treated as a known code",
  );
  // `raw` is quoted by unknown_error's copy, so it is the one value that can
  // reach a browser unmapped. It must be identifier-shaped or nothing.
  expect(
    /^[A-Z][A-Z0-9_]{2,63}$/.test(raw),
    `adminErrorCode returned a non-identifier as quotable text: ${raw}`,
  );
  expect(
    !raw.includes("assessment_assignments") && !raw.includes("@"),
    `adminErrorCode's quotable value carries database wording: ${raw}`,
  );
  // An unmapped SCREAMING_SNAKE code IS quotable -- that is the case the
  // placeholder exists for, and the reason it is not simply removed.
  expect(
    adminErrorCode(new Error("SOME_NEW_UNMAPPED_CODE")).raw === "SOME_NEW_UNMAPPED_CODE",
    "an unrecognised but identifier-shaped code must still be quotable, so a support call has something to give us",
  );
}

// ---------------------------------------------------------------------------
// G. The dialog's own behaviour on failure.
// ---------------------------------------------------------------------------
//
// Contracts F and G of the brief: a failed cancellation must preserve what the
// admin typed, and a second click must not fire a second mutation. Both are
// frontend behaviour with no database half, so they are asserted here on the
// shapes that implement them.
{
  const route = stripComments(read(ROUTE));

  // The success handler clears `reason`; the error handler must not. Anything
  // that resets state inside onError would make the admin retype a 2000
  // character explanation to fix a typo in it.
  const onErrorBody = /onError:\s*\(([^)]*)\)\s*=>\s*([^,]+),/.exec(route);
  expect(Boolean(onErrorBody), `could not find the cancel mutation's onError in ${ROUTE}`);
  if (onErrorBody) {
    expect(
      !/setReason|setDialogOpen/.test(onErrorBody[2]),
      `${ROUTE}'s onError must not clear the reason or close the dialog -- a refusal the admin can act on has to leave them something to act on`,
    );
  }

  // Duplicate submit protection, and the two client-side refusals, all in the
  // one disabled expression.
  expect(
    /disabled=\{!canSubmit\}/.test(route),
    `${ROUTE}'s confirm button must be gated on canSubmit`,
  );
  expect(
    /const canSubmit =[^;]*cancel\.isPending/.test(route),
    `${ROUTE}'s canSubmit must include cancel.isPending -- otherwise a second click fires a second mutation`,
  );
  expect(
    /const canSubmit =[^;]*trimmedReason\.length > 0/.test(route),
    `${ROUTE}'s canSubmit must require a non-empty trimmed reason, so an empty one never reaches the server`,
  );
  expect(
    /const canSubmit =[^;]*!reasonTooLong/.test(route),
    `${ROUTE}'s canSubmit must reject an over-length reason before submitting`,
  );

  // The reason is trimmed on the way out, matching the server schema and the
  // RPC's own btrim.
  expect(/reason:\s*reason\.trim\(\)/.test(route), `${ROUTE} must send a trimmed reason`);
}

// ---------------------------------------------------------------------------
// H. What actually reaches the DOM, in both languages.
// ---------------------------------------------------------------------------
//
// Everything above reasons about maps and source text. This renders the real
// component and reads the real output, which is the only way to assert the
// thing the defect was actually about: that an admin does not see an
// identifier. A correct map behind a broken component still shows a constant.
{
  const render = (error: unknown, lang: "sv" | "en") =>
    capturingConsole(() =>
      renderToStaticMarkup(
        <I18nProvider>
          <LanguageScope lang={lang}>
            <AdminActionError error={error} />
          </LanguageScope>
        </I18nProvider>,
      ),
    ).result;

  // Nothing at rest. The dialog mounts this unconditionally, so a null error
  // must not draw an empty alert box. (LanguageScope contributes its own
  // wrapper div, so the assertion is on the alert, not on an empty string.)
  expect(
    !render(null, "sv").includes('role="alert"'),
    "AdminActionError must render no alert for a null error",
  );

  for (const lang of ["sv", "en"] as const) {
    // Every refusal the migration can raise renders as prose.
    const refusals = [
      "ADMIN_CANCEL_REASON_REQUIRED",
      "ADMIN_CANCEL_REASON_TOO_LONG",
      "ADMIN_CANCEL_NOT_CANCELLABLE",
      "ADMIN_CANCEL_STATE_INCONSISTENT",
      "ADMIN_CANCEL_NOT_FOUND",
      "ADMIN_CANCEL_FORBIDDEN",
      "ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED",
    ];
    for (const identifier of refusals) {
      const html = render(new Error(identifier), lang);
      expect(
        !html.includes(identifier),
        `[${lang}] rendering ${identifier} put the identifier itself on screen: ${html}`,
      );
      expect(
        !/[A-Z][A-Z0-9]*_[A-Z0-9_]+/.test(html.replace(/data-admin-error-code="[^"]*"/, "")),
        `[${lang}] rendering ${identifier} produced something identifier-shaped: ${html}`,
      );
      expect(
        html.includes('role="alert"'),
        `[${lang}] rendering ${identifier} produced no alert role -- a screen reader would miss the refusal`,
      );
    }

    // The two that must read differently. This is the whole point: before the
    // contract, both of these produced the same sentence.
    const blank = render(new Error("ADMIN_CANCEL_REASON_REQUIRED"), lang);
    const late = render(new Error("ADMIN_CANCEL_NOT_CANCELLABLE"), lang);
    expect(
      blank !== late,
      `[${lang}] "type a reason" and "this can no longer be cancelled" still render identically -- the defect is not fixed`,
    );

    // And the raw database wording never reaches the DOM.
    const dump =
      'new row for relation "assessment_assignments" violates check constraint "assessment_assignments_person_context_agrees" DETAIL: Failing row contains (..., cancel-legacy@acc.invalid, ...)';
    const html = render(new Error(dump), lang);
    expect(
      !html.includes("assessment_assignments") &&
        !html.includes("person_context_agrees") &&
        !html.includes("@acc.invalid"),
      `[${lang}] a raw constraint violation leaked into the DOM: ${html}`,
    );
    // It still has to be reportable, though -- that is what the {code}
    // placeholder is for.
    expect(
      html.length > 0 && html.includes('role="alert"'),
      `[${lang}] an unrecognised failure must still tell the admin something`,
    );
  }

  // The Swedish and English copy really are different strings, so a missing
  // translation cannot pass by falling back.
  expect(
    render(new Error("ADMIN_CANCEL_NOT_CANCELLABLE"), "sv") !==
      render(new Error("ADMIN_CANCEL_NOT_CANCELLABLE"), "en"),
    "the Swedish and English refusal copy are identical -- one of them is missing",
  );
}

// ---------------------------------------------------------------------------
// I. The remaining debt is counted, not forgotten.
// ---------------------------------------------------------------------------
//
// This PR converts the cancellation path only. Twelve other sinks across five
// routes still render an error's message, and they are the second Admin Portal
// reliability PR. Listing them here means the number can only go DOWN: a new
// route that renders a raw message fails this guard, and a fixed one has to be
// removed from the list.
{
  const PENDING_RAW_MESSAGE_ROUTES = [
    "src/routes/_authenticated.admin.users.$userId.tsx",
    "src/routes/_authenticated.admin.assessments.$assessmentId.tsx",
    "src/routes/_authenticated.admin.jobs.$id.tsx",
    "src/routes/_authenticated.admin.employers.index.tsx",
    "src/routes/_authenticated.admin.employers.$employerId.tsx",
  ];

  const routeDir = new URL("../src/routes/", import.meta.url);
  const adminRoutes = readdirSync(routeDir)
    .filter((f) => f.startsWith("_authenticated.admin") && f.endsWith(".tsx"))
    .map((f) => `src/routes/${f}`);

  for (const file of adminRoutes) {
    const body = stripComments(read(file));
    const leaks = /set[A-Za-z]*\(\s*(?:e|err|error)(?:\s*as\s*Error)?\.message\s*\)/.test(body);
    if (leaks) {
      expect(
        PENDING_RAW_MESSAGE_ROUTES.includes(file),
        `${file} renders a raw error message and is not on the known-debt list. New admin surfaces must use <AdminActionError />.`,
      );
    } else {
      expect(
        !PENDING_RAW_MESSAGE_ROUTES.includes(file),
        `${file} no longer renders a raw error message -- remove it from PENDING_RAW_MESSAGE_ROUTES in this guard so the list stays honest`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("admin-error-contract:check FAILED\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}

console.log(
  `admin-error-contract:check OK (${ADMIN_ERROR_CODES.length} codes, complete in sv and en; every ADMIN_CANCEL_* refusal is mapped; the reason ceiling and cancellable status set agree across SQL, server function and route)`,
);
