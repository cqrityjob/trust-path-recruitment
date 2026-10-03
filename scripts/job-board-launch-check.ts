/**
 * Guard: the job-board launch-readiness corrections stay corrected.
 *
 * A read-only audit of the job board found eight defects between an employer
 * writing an advert and a candidate applying to it. The database halves are
 * proved by SQL suites (jobs_not_editable_in_place, jobs_publish_window_and_url_
 * scheme, job_cvs_no_client_writes in scripts/db-test.sh). This is the
 * application half, and it asserts BEHAVIOUR wherever the code is a pure
 * function and SOURCE where it is a server function or a route that cannot be
 * imported here:
 *
 *   1. restore -> publish: an advert whose expires_at has passed (or is more
 *      than 90 days out, or whose deadline has passed) is refused by name, in
 *      the server function AND in the hub's readiness checklist;
 *   2. application_url is a web address -- zod, the admin schema and every
 *      place an anchor is built from it;
 *   3. /employer/.../jobs/new keeps the draft it created, so a retry or a
 *      double click never inserts a second one;
 *   4. the employer's jobs list refreshes the overview its badges come from,
 *      and its default view shows drafts;
 *   5. the all-applications list counts a CQrityjob CV as a CV, and does not
 *      offer to download a file that does not exist;
 *   6. a failed submission with no database verdict reads the application back
 *      before it removes the CV the application may already point at;
 *   7. a closed job's URL answers 404 from the loader, not 200 from the render.
 *
 * Run: bun run job-board-launch:check
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  isHttpApplicationUrl,
  safeApplicationHref,
} from "../src/lib/job-intelligence/application-url";
import { checkJobReadiness, publishDateProblems } from "../src/lib/job-intelligence/job-readiness";
import { isAmbiguousSubmissionFailure } from "../src/lib/job-intelligence/submission-failure";
import { matchesDefaultListView, matchesPhaseFilter } from "../src/lib/recruitment/definitions";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Source without comments, so a guard reads code and not the prose that explains it. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let failures = 0;
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${String(detail)}`}`,
  );
  if (!ok) failures += 1;
}
const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const FUNCS = "src/lib/job-intelligence/employer-jobs.functions.ts";
const ADMIN_FUNCS = "src/lib/job-intelligence/admin.functions.ts";
const APPS = "src/lib/job-intelligence/applications.functions.ts";
const RECRUIT = "src/lib/recruitment/recruitment.functions.ts";
const MODEL = "src/components/employer/job-form/model.ts";
const NEW_JOB = "src/routes/_authenticated.employer.$employerSlug.jobs.new.tsx";
const LIST = "src/routes/_authenticated.employer.$employerSlug.jobs.index.tsx";
const APPS_LIST = "src/routes/_authenticated.employer.$employerSlug.applications.index.tsx";
const PANEL = "src/components/jobs/JobApplicationPanel.tsx";
const DIALOG = "src/components/jobs/ExternalApplyDialog.tsx";
const APPLY = "src/components/jobs/ApplyInternalDialog.tsx";
const PUBLIC_JOB = "src/routes/jobs.$slug.tsx";

// ── 1. publication dates ────────────────────────────────────────────────────
console.log("publication dates: restore -> publish");
{
  const now = new Date("2026-10-03T12:00:00Z");
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const DAY = 86_400_000;
  const problems = (expires: string | null, deadline: string | null = null) =>
    publishDateProblems({ expires_at: expires, deadline_at: deadline }, now);

  ck(
    "an expires_at in the past is EXPIRES_AT_IN_PAST",
    problems(iso(-2 * DAY)).join() === "EXPIRES_AT_IN_PAST",
  );
  ck(
    "an expires_at equal to now is refused, as the database refuses it",
    problems(iso(0)).join() === "EXPIRES_AT_IN_PAST",
  );
  ck("a minute ahead is fine", problems(iso(60_000)).length === 0);
  ck("89 days ahead is fine", problems(iso(89 * DAY)).length === 0);
  ck(
    "exactly 90 days ahead is fine (the database refuses only MORE than 90)",
    problems(iso(90 * DAY)).length === 0,
  );
  ck(
    "more than 90 days ahead is EXPIRES_AT_TOO_FAR",
    problems(iso(90 * DAY + 1)).join() === "EXPIRES_AT_TOO_FAR",
  );
  ck(
    "a deadline in the past is DEADLINE_IN_PAST",
    problems(iso(30 * DAY), iso(-1 * DAY)).join() === "DEADLINE_IN_PAST",
  );
  ck(
    "a deadline equal to now is allowed (the database refuses only before published_at)",
    problems(iso(30 * DAY), iso(0)).length === 0,
  );
  ck(
    "no dates at all is not a DATE problem (the missing-field check owns that)",
    problems(null, null).length === 0,
  );
  ck("an unreadable date is not judged", problems("not-a-date").length === 0);

  const COMPLETE = {
    title_sv: "Väktare",
    description_sv: "En beskrivning.",
    application_method: "internal",
    expires_at: iso(30 * DAY),
  };
  ck("a complete advert with a future expires_at is ready", checkJobReadiness(COMPLETE, now).ready);
  const restored = checkJobReadiness({ ...COMPLETE, expires_at: iso(-2 * DAY) }, now);
  ck(
    "a restored advert whose expires_at has passed is not ready, and says which date",
    !restored.ready && restored.blockingMissing.join() === "expiresWindow",
    restored.blockingMissing.join(),
  );
  const lateDeadline = checkJobReadiness({ ...COMPLETE, deadline_at: iso(-1 * DAY) }, now);
  ck(
    "a restored advert whose deadline has passed is not ready, and says which date",
    !lateDeadline.ready && lateDeadline.blockingMissing.join() === "deadline",
    lateDeadline.blockingMissing.join(),
  );
  ck(
    "an advert with no expires_at is told one thing, not two",
    checkJobReadiness({ ...COMPLETE, expires_at: null }, now).blockingMissing.join() ===
      "expiresAt",
  );
  for (const id of ["expiresWindow", "deadline"] as const) {
    const key = `employer.jobs.readiness.${id}`;
    ck(`the readiness label ${key} exists in sv and en`, Boolean(sv[key]) && Boolean(en[key]));
  }
}

console.log("publication dates: the server function");
{
  const f = code(FUNCS);
  const publish = f.slice(
    f.indexOf("export const publishEmployerJob"),
    f.indexOf("export const closeEmployerJob"),
  );
  const check = publish.indexOf("publishDateProblems(before, new Date())");
  const update = publish.indexOf('status: "published"');
  ck(
    "publishEmployerJob checks the date rules before it publishes",
    check > 0 && update > check && /throw new Error\(dateProblems\[0\]\)/.test(publish),
  );
  ck(
    "publishEmployerJob refuses an external advert whose address is not a web address",
    /application_method === "external" && !isHttpApplicationUrl\(before\.application_url\)/.test(
      publish,
    ),
  );
  ck(
    "the 23514 mapping reads the trigger's own rules, so an old advert is not told to check its workplace type",
    [
      "not in an employer-editable state",
      "expires_at must be in the future",
      "expires_at cannot be more than 90 days",
      "deadline_at must be on or after published_at",
      "application_url must be an http",
      "requires an http or https application_url",
    ].every((needle) => f.includes(`"${needle}"`)) &&
      /TRIGGER_RULE_CODES/.test(f.slice(f.indexOf("function sanitizeJobWriteError"))),
  );
  const model = code(MODEL);
  for (const [codeName, key] of [
    ["EXPIRES_AT_IN_PAST", "employer.jobs.form.error.expiresInPast"],
    ["EXPIRES_AT_TOO_FAR", "employer.jobs.form.error.expiresTooFar"],
    ["DEADLINE_IN_PAST", "employer.jobs.form.error.deadlineInPast"],
    ["APPLICATION_URL_INVALID", "employer.jobs.form.error.applicationUrlInvalid"],
  ] as const) {
    ck(
      `${codeName} has its own sentence in sv and en and is mapped by the form`,
      new RegExp(`${codeName}:\\s*"${key.replace(/\./g, "\\.")}"`).test(model) &&
        Boolean(sv[key]) &&
        Boolean(en[key]),
    );
  }
  ck(
    "none of the four sentences is the generic 'check workplace type' message",
    ["expiresInPast", "expiresTooFar", "deadlineInPast", "applicationUrlInvalid"].every(
      (k) =>
        !/arbetsplatstyp|workplace type/i.test(
          sv[`employer.jobs.form.error.${k}`] + en[`employer.jobs.form.error.${k}`],
        ),
    ),
  );
}

// ── 2. application_url ──────────────────────────────────────────────────────
console.log("application_url is a web address");
{
  const refused = [
    "javascript:alert(document.domain)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://exempel.invalid/cv",
    "vbscript:msgbox(1)",
    "//exempel.invalid/ansok",
    "exempel.invalid/ansok",
    "https://",
    "http:///path",
    " https://exempel.invalid/",
    "java\tscript:alert(1)",
    "",
  ];
  for (const v of refused)
    ck(
      `${JSON.stringify(v)} is not an application address`,
      !isHttpApplicationUrl(v) && safeApplicationHref(v) === null,
    );
  for (const v of [
    "https://exempel.invalid/ansok",
    "HTTP://Exempel.invalid:8080/p?q=1#f",
    "http://localhost/x",
  ]) {
    ck(`${JSON.stringify(v)} is`, isHttpApplicationUrl(v) && safeApplicationHref(v) === v);
  }
  ck("null and undefined are not", !isHttpApplicationUrl(null) && !isHttpApplicationUrl(undefined));

  ck(
    "the employer's application_url schema refuses anything but http(s)",
    /application_url:\s*z\s*\.string\(\)\s*\.trim\(\)\s*\.url\(\)\s*\.max\(500\)\s*\.refine\(\(v\) => isHttpApplicationUrl\(v\)/.test(
      code(FUNCS),
    ),
  );
  ck(
    "the admin schema refuses it too",
    /application_url:\s*z\s*\.string\(\)\s*\.trim\(\)\s*\.url\(\)\s*\.max\(500\)\s*\.refine\(\(v\) => isHttpApplicationUrl\(v\)/.test(
      code(ADMIN_FUNCS),
    ),
  );
  ck(
    "duplicating an advert does not copy an address the database would refuse",
    /application_url:\s*isHttpApplicationUrl\(src\.application_url\) \? src\.application_url : null/.test(
      code(FUNCS),
    ),
  );
  ck(
    "the apply panel only links a web address",
    /const externalUrl = safeApplicationHref\(job\.application_url\)/.test(code(PANEL)) &&
      /job\.application_method === "external" && externalUrl/.test(code(PANEL)),
  );
  ck(
    "the external apply dialog refuses to build an anchor from anything else",
    /if \(!safeApplicationHref\(url\)\) return null/.test(code(DIALOG)),
  );
}

// ── 3. /jobs/new keeps its draft ────────────────────────────────────────────
console.log("a new advert is saved once");
{
  const n = code(NEW_JOB);
  ck(
    "the page keeps the id of the draft it created",
    /const draftIdRef = useRef<string \| null>\(null\)/.test(n),
  );
  ck(
    "every save passes that id on, once it has one",
    /const id = draftIdRef\.current;[\s\S]*?\.\.\.\(id \? \{ id \} : \{\}\)[\s\S]*?draftIdRef\.current = saved\.id/.test(
      n,
    ),
  );
  ck(
    "saves run one at a time, so a double click cannot race two inserts",
    /saveQueueRef\.current\.then\(run, run\)/.test(n),
  );
  const direct = n.match(/saveFn\(/g) ?? [];
  ck(
    "saveFn is called in exactly one place, the serialised one",
    direct.length === 1,
    `${direct.length} calls`,
  );
  ck(
    "both mutations save through it",
    (n.match(/await saveDraftOnce\(workspace\.employerId, vars\.values\)/g) ?? []).length === 2,
  );
}

// ── 4. the employer's jobs list ─────────────────────────────────────────────
console.log("the employer's jobs list");
{
  const l = code(LIST);
  const refreshAt = l.indexOf("function refreshAfterAction() {");
  const refreshBody = refreshAt < 0 ? "" : l.slice(refreshAt, l.indexOf("\n  }\n", refreshAt));
  ck(
    "every list action refreshes the recruitment overview its badges and filter come from",
    refreshBody.includes('"recruitment-overview"') &&
      refreshBody.includes('"jobs"') &&
      refreshBody.includes('"dashboard-stats"'),
  );
  const mutations = l.match(/useMutation\(\{/g) ?? [];
  const refreshed = l.match(/onSuccess: refreshAfterAction/g) ?? [];
  ck(
    "all four mutations (close, duplicate, delete, restore) use it",
    mutations.length === 4 && refreshed.length === 4,
    `${mutations.length} mutations, ${refreshed.length} refresh`,
  );
  ck(
    "the default view is not 'active'",
    !/view\.phase \?\? "active"/.test(l) && /matchesDefaultListView/.test(l),
  );

  ck("a draft is shown in the default list view", matchesDefaultListView("draft", 0));
  ck(
    "an active recruitment is shown in the default list view",
    matchesDefaultListView("published", 0) && matchesDefaultListView("closed", 2),
  );
  ck(
    "a closed recruitment with nobody left and a completed one are not",
    !matchesDefaultListView("closed", 0) && !matchesDefaultListView("completed", 0),
  );
  ck(
    "the overview's 'active' filter is unchanged: it still excludes drafts, so the count it links from matches its rows",
    !matchesPhaseFilter("active", "draft", 0) && matchesPhaseFilter("active", "published", 0),
  );
  for (const k of ["rec.list.phase.default", "rec.list.emptyDefault"]) {
    ck(`${k} exists in sv and en`, Boolean(sv[k]) && Boolean(en[k]));
  }
}

// ── 5. the all-applications list ────────────────────────────────────────────
console.log("the all-applications list and the CV chip");
{
  const a = code(APPS);
  const employerList = a.slice(
    a.indexOf("export const listApplicationsForEmployer"),
    a.indexOf("// -------------------- CV DOWNLOAD"),
  );
  const recruitExpr =
    /hasCv: (Boolean\(r\.cv_storage_path\) \|\| r\.cv_source === "cqrityjob_cv"),/.exec(
      code(RECRUIT),
    )?.[1];
  ck(
    "the employer list selects cv_source",
    /cv_storage_path, cv_source, created_at/.test(employerList),
  );
  ck(
    "it counts a CQrityjob CV as a CV, with the expression the recruitment table uses",
    Boolean(recruitExpr) && employerList.includes(`hasCv: ${recruitExpr},`),
  );
  ck(
    "it says which door the CV came through",
    /cvSource: \(r\.cv_source as ApplicationCvSource\) \?\? "upload"/.test(employerList),
  );
  const chip = code(APPS_LIST);
  const at = chip.indexOf('r.cvSource === "cqrityjob_cv"');
  ck(
    "a CQrityjob CV opens the application; only a file offers a download",
    at > 0 &&
      chip.indexOf("<Link", at) > at &&
      chip.indexOf("onDownloadCv(r.id)") > chip.indexOf("<Link", at),
  );
}

// ── 6. a failed submission and the CV ───────────────────────────────────────
console.log("a failed submission and the uploaded CV");
{
  ck(
    "a database verdict (23505, P0001, 23514, 42501) is not ambiguous",
    ["23505", "P0001", "23514", "42501", "57014", "40001"].every(
      (c) => !isAmbiguousSubmissionFailure({ code: c }),
    ),
  );
  ck(
    "no SQLSTATE at all is ambiguous",
    isAmbiguousSubmissionFailure({ code: "" }) &&
      isAmbiguousSubmissionFailure({}) &&
      isAmbiguousSubmissionFailure(null) &&
      isAmbiguousSubmissionFailure({ message: "TypeError: fetch failed" }),
  );
  ck(
    "a PostgREST code is ambiguous",
    isAmbiguousSubmissionFailure({ code: "PGRST301" }) &&
      isAmbiguousSubmissionFailure({ code: "PGRST000" }),
  );
  ck(
    "connection-loss classes are ambiguous",
    isAmbiguousSubmissionFailure({ code: "08006" }) &&
      isAmbiguousSubmissionFailure({ code: "57P01" }),
  );

  const a = code(APPS);
  const fail = a.indexOf("if (insertErr && isAmbiguousSubmissionFailure(insertErr)) {");
  const confirm = a.indexOf("confirmCommitAfterAmbiguousFailure(", fail);
  const cleanup = a.indexOf("remove([storagePath])");
  ck(
    "an ambiguous failure reads the application back before the CV can be removed",
    fail > 0 && confirm > fail && cleanup > confirm && /if \(insertErr && !committed\) \{/.test(a),
  );
  ck(
    "a CV is removed only when the database refused, or after the read found no application",
    a.split("remove([storagePath])").length === 2,
  );
  ck(
    "when the commit cannot be told the CV is kept and the candidate is told so",
    /read\.state === "unknown"[\s\S]*?throw new Error\("SUBMISSION_UNCONFIRMED"\)/.test(a),
  );
  ck(
    "a committed application is answered from its row, and its receipt still goes",
    /committed = read\.row/.test(a) && /\(committed \?\? submitted\)/.test(a),
  );
  ck(
    "the apply dialog has a sentence for SUBMISSION_UNCONFIRMED",
    /SUBMISSION_UNCONFIRMED: "rec\.apply\.error\.network"/.test(code(APPLY)) &&
      Boolean(sv["rec.apply.error.network"]),
  );
}

// ── 7. a closed job's URL ───────────────────────────────────────────────────
console.log("a closed job's public URL");
{
  const r = code(PUBLIC_JOB);
  ck(
    "the loader throws notFound() for an advert with no public row, so the response is a 404 and not a soft 200",
    /loader: async \(\{ params, context \}\) => \{[\s\S]*?if \(!job\) throw notFound\(\);[\s\S]*?return job;/.test(
      r,
    ),
  );
  ck(
    "the component still guards a client-side arrival",
    /if \(!ssr\.data\) throw notFound\(\)/.test(r),
  );
}

// ── 8. the database half is in the release record and in db-test ────────────
console.log("the database half");
{
  const state = JSON.parse(read("supabase/release-state.json")) as {
    frontier: { file: string; hostedState: string; rollback?: string }[];
  };
  const dbtest = read("scripts/db-test.sh");
  for (const [file, suite] of [
    ["20270130090000_jobs_not_editable_in_place.sql", "jobs_not_editable_in_place_test.sql"],
    [
      "20270131090000_jobs_publish_window_and_url_scheme.sql",
      "jobs_publish_window_and_url_scheme_test.sql",
    ],
    ["20270201090000_job_cvs_no_client_writes.sql", "job_cvs_no_client_writes_test.sql"],
  ] as const) {
    const entry = state.frontier.find((e) => e.file === file);
    ck(
      `${file} is recorded as pending in release-state.json, with its rollback`,
      entry?.hostedState === "pending" && Boolean(entry?.rollback),
    );
    ck(
      `scripts/db-test.sh runs ${suite} and proves it fails without the migration`,
      dbtest.includes(suite) && dbtest.includes(file.replace(".sql", "_rollback.sql")),
    );
  }
}

if (failures > 0) {
  console.error(`\njob-board-launch:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("\njob-board-launch:check — ok");
