// What a candidate is told, and what they must never be told.
//
// Run via `bun run candidate-notification:check`.
//
// ── WHY THIS IS THE STRICTEST FILE IN THE SET ──────────────────────────
//
// Everything else in this product is read by an employer who has context. An
// email is read by the person it is about, alone, on a phone, and it cannot be
// taken back. So the rules are absolute rather than best-effort:
//
//   no score, no rubric level, no assessment content
//   no reason for the employer's decision
//   and specifically no reason DERIVED from an assessment
//
// The last one is the one worth writing down. A rejection that explains itself
// using test results is the product making an employment argument on the
// employer's behalf -- which is the single thing this whole codebase is built
// not to do. The rejection says the employer chose to proceed with others, and
// stops. Same sentence for everybody, which is also what stops it becoming a
// comparison between people.
//
// ── AND THE TRANSITION THAT SENDS NOTHING ──────────────────────────────
//
// 'reviewing' means somebody at the employer opened the application. Emailing
// that tells the candidate nothing they can act on, arrives whenever a
// recruiter happened to click, and teaches people to ignore mail from us. The
// payload function returns no row for it, so it cannot be sent even by a
// caller that asks -- and this asserts the rule lives there and not only in
// the calling code.

import { readFileSync } from "node:fs";
import {
  renderApplicationStatusEmail,
  type NotifiableStatus,
} from "../src/lib/email/send-application-status-email.server";

const fails: string[] = [];
const ck = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) fails.push(name);
};

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

const STATUSES: NotifiableStatus[] = ["interview", "rejected", "hired"];
const LANGS = ["sv", "en"] as const;

const base = {
  recipientEmail: "kandidat@example.test",
  employerName: "Buller o bång",
  jobTitle: "Väktare natt",
  siteOrigin: "https://cqrityjob.com",
};

console.log("\n1. Every message exists, in both languages");
{
  for (const status of STATUSES) {
    for (const language of LANGS) {
      const { subject, html } = renderApplicationStatusEmail({ ...base, status, language });
      ck(`${language}/${status}: has a subject`, subject.trim().length > 8, subject);
      ck(`${language}/${status}: has a body`, html.length > 200);
      ck(
        `${language}/${status}: names the employer`,
        html.includes("Buller o bång") || subject.includes("Buller o bång"),
        "a candidate applies to several organisations; an unplaceable message is worse than none",
      );
      ck(
        `${language}/${status}: names the advertisement`,
        html.includes("Väktare natt") || subject.includes("Väktare natt"),
      );
    }
  }
  // The same message in two languages is a missed translation.
  for (const status of STATUSES) {
    const sv = renderApplicationStatusEmail({ ...base, status, language: "sv" });
    const en = renderApplicationStatusEmail({ ...base, status, language: "en" });
    ck(`${status}: sv and en differ`, sv.html !== en.html && sv.subject !== en.subject);
  }
}

console.log("\n2. Nothing about the assessment reaches the candidate");
{
  // Two kinds of forbidden word, because one list cannot do both jobs.
  //
  // Some are unambiguous anywhere they appear: "poäng", "rubric", "underkänd".
  // Others are short and live inside innocent words -- "pass" is inside
  // "Security Passport", which the rejection says on purpose because a
  // candidate should be told their Passport is still theirs. Substring
  // matching those flagged correct copy, which is a guard training its author
  // to weaken it.
  //
  // So the ambiguous ones are matched as whole words and the rest as
  // substrings.
  const FORBIDDEN_ANYWHERE = [
    "poäng",
    "rubrik",
    "rubric",
    "bedömning",
    "assessment",
    "godkänd",
    "underkänd",
    "lämplig",
    "suitab",
    "rangordn",
    "kompetensmognad",
    "maturity",
    "score",
  ];
  const FORBIDDEN_AS_WORD = ["pass", "fail", "rank", "test", "level", "nivå", "betyg"];

  for (const status of STATUSES) {
    for (const language of LANGS) {
      const { subject, html } = renderApplicationStatusEmail({ ...base, status, language });
      const text = `${subject} ${html}`.toLowerCase();
      for (const word of FORBIDDEN_ANYWHERE) {
        ck(`${language}/${status}: says nothing about "${word}"`, !text.includes(word));
      }
      for (const word of FORBIDDEN_AS_WORD) {
        const asWord = new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "u");
        ck(`${language}/${status}: no standalone "${word}"`, !asWord.test(text));
      }
    }
  }
}

console.log("\n3. A rejection gives no reason, and no reason it could not give");
{
  for (const language of LANGS) {
    const { html } = renderApplicationStatusEmail({ ...base, status: "rejected", language });
    const text = html.toLowerCase();
    for (const word of ["eftersom", "because", "därför att", "due to", "på grund av"]) {
      ck(`${language}: no causal claim ("${word}")`, !text.includes(word));
    }
    ck(
      `${language}: says the employer chose others`,
      /andra kandidater|other candidates/.test(text),
      "the one true, neutral thing there is to say",
    );
    // The candidate keeps what is theirs, and being rejected does not change that.
    ck(
      `${language}: does not imply their data is gone`,
      /passport/.test(text),
      "a rejection is a good moment to say their Passport is still theirs",
    );
  }
}

console.log("\n4. The rule about internal transitions lives in the database");
{
  const sql = read("supabase/migrations/20260909093000_application_status_notifications.sql");
  ck(
    "the payload function allow-lists the three candidate-facing statuses",
    /new_status IN \('interview', 'rejected', 'hired'\)/.test(sql),
  );
  ck(
    "'reviewing' is not among them",
    !/new_status IN \([^)]*reviewing/.test(sql),
    "an internal status must not be emailable, even by a caller that asks",
  );
  // Scoped to the payload function. `notified_at IS NULL` also appears in the
  // recording function, the CHECK and the index, so a file-wide match passed
  // while the dedup clause had been deleted from the query that matters.
  const payloadFn = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.jase_notification_payload"),
  );
  ck(
    "an already-notified event yields nothing",
    /RETURN QUERY[\s\S]{0,1200}e\.notified_at IS NULL/.test(payloadFn),
    "deduplication has to be in the query, not only in the caller",
  );
  ck(
    "the payload is refused outside the organisation",
    /employer_memberships[\s\S]{0,200}RETURN;/.test(sql),
  );
  ck(
    "delivery cannot be recorded as both sent and failed",
    /notified_at IS NULL OR notify_error IS NULL/.test(sql),
  );
  ck(
    "a delivered event stays delivered",
    /WHERE id = _event_id\s*\n\s*AND notified_at IS NULL/.test(sql),
    "otherwise a racing retry overwrites success with a failure",
  );
}

console.log("\n5. The address never leaves the server");
{
  // Comment-stripped: the assertions below measure windows in code, and the
  // paragraphs explaining the design sit inside those windows.
  const app = read("src/lib/job-intelligence/applications.functions.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const fn = app.slice(app.indexOf("async function notifyCandidate"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  ck(
    "notifyCandidate returns a verdict, not a recipient",
    /Promise<"sent" \| "skipped" \| "failed" \| "not_applicable">/.test(fn.slice(0, 400)),
  );
  ck(
    "the address is not returned to the caller",
    !/return[^;]*recipient/i.test(body),
    "an employer surface must not learn the candidate's address this way",
  );
  ck(
    "a send failure does not fail the status change",
    !/throw/.test(body),
    "the employer's decision happened and stands whatever the provider did",
  );
  ck(
    "an unconfigured provider is not counted as an attempt",
    /skipped[\s\S]{0,200}return "skipped"/.test(body),
    "otherwise the retry budget burns down in an environment that never sends",
  );
}

console.log("\n6. Sending is inert without a provider");
{
  const sender = read("src/lib/email/send-application-status-email.server.ts");
  ck("the api key is read from the environment", /process\.env\.RESEND_API_KEY/.test(sender));
  ck(
    "no key means no network call",
    /if \(!apiKey \|\| !fromEmail\) \{[\s\S]{0,200}return \{ ok: false, skipped: true \}/.test(
      sender,
    ),
  );
  ck("no new dependency was added", !/from "resend"|require\("resend"\)/.test(sender));
  ck(
    "a provider error body is never persisted",
    !/res\.text\(\)/.test(sender),
    "those can carry the recipient address, and notify_error is employer-readable",
  );
}

console.log(
  fails.length
    ? `\ncandidate-notification: FAIL (${fails.length})`
    : "\ncandidate-notification: PASS",
);
process.exit(fails.length ? 1 : 0);
