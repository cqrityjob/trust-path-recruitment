// One outcome, one button — and no browser dialogs.
//
// Run via `bun run employer-job-lifecycle:check`.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────
//
// A customer pressed "Stäng" on a job advertisement and then went looking for
// where it had gone. Two things caused that:
//
//   1. closeEmployerJob and archiveEmployerJob both set status='archived'.
//      Two buttons, two confirmations, one result. Neither name said the
//      advertisement was still there, under a filter called "Arkiverade".
//
//   2. The confirmation was window.confirm(), so the dialog announced the
//      hostname, could not say what would happen, and gave a destructive
//      action the same "OK" as a harmless one.
//
// ── WHAT MUST STAY TRUE ─────────────────────────────────────────────────
//
// The vocabulary is now: a never-published draft is DELETED, anything that was
// ever live is CLOSED, and closed advertisements live under "Avslutade
// annonser". The two ways this regresses are a second path back to 'archived',
// and a window.confirm() creeping back into an employer surface -- both of
// which are cheap to write and invisible in a screenshot.
//
// The database-side guard has its own coverage: jobs_delete_draft() refuses
// published, previously-published, and anything with applications, assignments
// or invitations. This file guards the interface around it.

import { readFileSync, readdirSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const LIST = "src/routes/_authenticated.employer.$employerSlug.jobs.index.tsx";
const HUB = "src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.index.tsx";
const EDIT = "src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.edit.tsx";
const FUNCTIONS = "src/lib/job-intelligence/employer-jobs.functions.ts";
const MIGRATION = "supabase/migrations/20260909090000_jobs_delete_unpublished_draft.sql";

// ---------------------------------------------------------------------------
// A. No window.confirm anywhere an employer works.
// ---------------------------------------------------------------------------

{
  const dirs = ["src/routes", "src/components/employer"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) {
        // The component that replaced it explains what it replaced, in a
        // comment. Code only.
        const src = read(path)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (/window\.confirm\s*\(/.test(src) && path.includes("employer")) offenders.push(path);
      }
    }
  };
  dirs.forEach(walk);
  expect(
    offenders.length === 0,
    `A: window.confirm() is back in an employer surface: ${offenders.join(", ")}. ` +
      `It announces the hostname, cannot state a consequence, and labels a ` +
      `destructive action "OK". Use ConfirmAction.`,
  );
}

// ---------------------------------------------------------------------------
// B. Exactly one path to 'archived'.
// ---------------------------------------------------------------------------

{
  const fns = read(FUNCTIONS);
  // Only the actual write. closeEmployerJob also names 'archived' in its audit
  // snapshot and its return value, and counting those made this assertion fail
  // on correct code -- which is worse than not having it.
  const setters = [...fns.matchAll(/\.update\(\{\s*status:\s*"archived"/g)].length;
  expect(
    setters === 1,
    `B: ${setters} server functions set status='archived'. There must be exactly ` +
      `one -- closeEmployerJob. A second is how "Stäng" and "Arkivera" came to ` +
      `be two buttons with one outcome.`,
  );
  expect(
    !/export const archiveEmployerJob/.test(fns),
    `B: archiveEmployerJob is back. It did what closeEmployerJob does.`,
  );
  expect(
    /export const deleteEmployerJob/.test(fns),
    `B: deleteEmployerJob is missing, so a draft cannot be discarded at all.`,
  );
  // The delete path must go through the guarded function, never a table DELETE.
  const del = fns.slice(fns.indexOf("export const deleteEmployerJob"));
  const body = del.slice(0, del.indexOf("\nexport const "));
  expect(
    /rpc\("jobs_delete_draft"/.test(body),
    `B: deleteEmployerJob no longer calls jobs_delete_draft().`,
  );
  expect(
    !/\.from\("jobs"\)[\s\S]{0,120}\.delete\(/.test(body),
    `B: deleteEmployerJob deletes from the jobs table directly. ` +
      `job_applications cascades from jobs, so that erases candidates' own ` +
      `records of having applied. The guard is in the database function.`,
  );
}

// ---------------------------------------------------------------------------
// C. The interface offers delete only where the database would allow it.
// ---------------------------------------------------------------------------

{
  for (const path of [LIST, HUB]) {
    const src = read(path).replace(/^\s*\/\/.*$/gm, "");
    const match = /const deletable = ([^;]+);/.exec(src);
    expect(Boolean(match), `C: ${path} has no \`deletable\` rule.`);
    if (!match) continue;
    // published_at, not status. restoreEmployerJob moves a closed job back to
    // 'draft', so status alone would offer delete on a job with a full history.
    expect(
      /published_at === null/.test(match[1]),
      `C: ${path}'s deletable rule does not test published_at. A closed job ` +
        `restored to draft would be offered a delete button the database ` +
        `refuses -- and the refusal would look like a bug.`,
    );
  }
}

// ---------------------------------------------------------------------------
// D. Every refusal the database can raise reaches the employer in words.
// ---------------------------------------------------------------------------

{
  const sql = read(MIGRATION);
  const raised = [...new Set([...sql.matchAll(/JOB_[A-Z_]+(?=:)/g)].map((m) => m[0]))].sort();
  expect(raised.length >= 5, `D: expected at least five refusal codes, found ${raised.length}.`);

  const model = read("src/components/employer/job-form/model.ts");
  for (const code of raised) {
    if (code === "JOB_NOT_FOUND") continue; // already mapped by the form's own set
    expect(
      model.includes(code),
      `D: jobs_delete_draft() can raise ${code}, but model.ts does not map it, ` +
        `so the employer is told "something went wrong" instead of which rule ` +
        `stopped them and what to do instead.`,
    );
  }
}

// ---------------------------------------------------------------------------
// E. The copy names the outcome, in both languages.
// ---------------------------------------------------------------------------

{
  const REQUIRED = [
    "employer.jobs.list.delete",
    "employer.jobs.list.close",
    "employer.jobs.list.filterArchived",
    "employer.jobs.confirm.delete.title",
    "employer.jobs.confirm.delete.body",
    "employer.jobs.confirm.close.title",
    "employer.jobs.confirm.close.body",
    "employer.jobs.error.hasApplications",
    "employer.jobs.error.notDeletable",
  ];
  for (const key of REQUIRED) {
    if (!sv[key]) errors.push(`E: dictionaries.sv is missing "${key}".`);
    if (!en[key]) errors.push(`E: dictionaries.en is missing "${key}".`);
  }

  // The consequence has to be IN the confirmation. "Är du säker?" was the
  // whole problem: it asked without saying what would happen.
  expect(
    /permanent/i.test(sv["employer.jobs.confirm.delete.body"] ?? ""),
    `E: the sv delete confirmation does not say the removal is permanent.`,
  );
  expect(
    /ansökningar/i.test(sv["employer.jobs.confirm.close.body"] ?? ""),
    `E: the sv close confirmation does not say applications are kept, which is ` +
      `the one thing an employer needs to know before pressing it.`,
  );
  expect(
    /applications/i.test(en["employer.jobs.confirm.close.body"] ?? ""),
    `E: the en close confirmation does not say applications are kept.`,
  );

  // "Arkiverade" was the word that lost the advertisement.
  for (const [lang, dict] of [
    ["sv", sv],
    ["en", en],
  ] as const) {
    const label = dict["employer.jobs.list.filterArchived"] ?? "";
    expect(
      !/arkiv|archiv/i.test(label),
      `E: the ${lang} closed-jobs filter still reads "${label}". An employer who ` +
        `pressed "Avsluta" looks for the word they pressed, not for an archive.`,
    );
  }
}

// ---------------------------------------------------------------------------
// F. The dialog is the product's own, and states its consequence separately.
// ---------------------------------------------------------------------------

{
  for (const path of [LIST, HUB, EDIT]) {
    const src = read(path);
    expect(
      /<ConfirmAction/.test(src),
      `F: ${path} has no ConfirmAction, so whatever it confirms is unconfirmed ` +
        `or confirmed by the browser.`,
    );
    expect(/consequence=\{/.test(src), `F: ${path} renders ConfirmAction without a consequence.`);
  }
  const component = read("src/components/employer/ConfirmAction.tsx");
  expect(
    /tone === "destructive"/.test(component),
    `F: ConfirmAction no longer distinguishes a destructive action visually.`,
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-job-lifecycle:check][error]", e);
  console.error(`\nemployer-job-lifecycle:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  "employer-job-lifecycle:check OK (no window.confirm, one path to archived, " +
    "delete offered only where the database allows it, every refusal has copy in sv and en)",
);
