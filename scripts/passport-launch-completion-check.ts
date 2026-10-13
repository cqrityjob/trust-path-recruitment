// Security Passport launch completion (2026-10-13): the candidate's duplicate
// warning, the wording that keeps "current" apart from "verified", and the
// reviewer queue that never presents a failed read as "nothing to review".
//
// Behaviour of the duplicate rule is exercised directly; the page contracts
// are asserted from source, the same way passport-page-composition-check
// does, because the rendered proof lives in the browser suites.
//
// Run: bun run passport-launch-completion:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  existingCredentialsOf,
  likelyDuplicatesOf,
} from "../src/lib/security-passport/duplicate-credential";
import type { Claim } from "../src/lib/security-passport/types";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");

const failures: string[] = [];
let assertions = 0;
function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

// ── 1 · the duplicate rule ──────────────────────────────────────────────
console.log("1 · a likely duplicate is found, and only a standing one");
const base = {
  claimType: "training",
  skillCode: null,
  skillLevel: null,
  issuerName: "Utbildaren AB",
  jurisdictionCode: "SE",
  subJurisdictionCode: null,
  authorisationScope: null,
  issuedOn: "2024-01-01",
  validFrom: null,
  validUntil: null,
  assertionLevel: "self_declared",
  verifierName: null,
  verificationMethod: null,
  verifiedOn: null,
  limitationSv: null,
  limitationEn: null,
  versionNo: 1,
  supersedesClaimId: null,
} as const;
const mk = (id: string, code: string | null, lifecycleState: string, claimType = "training") =>
  ({
    ...base,
    id,
    claimType,
    credentialCode: code,
    titleSv: `Merit ${id}`,
    titleEn: `Credential ${id}`,
    lifecycleState,
  }) as unknown as Claim;
const existing = existingCredentialsOf([
  mk("a", "VU1", "active"),
  mk("b", "VU1", "expired"),
  mk("c", "VU1", "revoked"),
  mk("d", "VU1", "superseded"),
  mk("e", "OV", "active", "licence"),
  mk("f", null, "active", "education"),
]);
check(
  likelyDuplicatesOf(existing, "VU1")
    .map((e) => e.id)
    .join(",") === "a,b",
  "a second VU1 matches the current and the expired VU1 — never an archived or replaced version",
);
check(likelyDuplicatesOf(existing, "VU2").length === 0, "another credential matches nothing");
check(
  likelyDuplicatesOf(existing, "").length === 0 && likelyDuplicatesOf(existing, null).length === 0,
  "no selection matches nothing",
);
check(!existing.some((e) => e.id === "f"), "a CV row without a catalogue code is not a credential");

// ── 2 · the form warns, offers the existing record, and never merges ────
console.log("2 · the add form warns and asks; it does not refuse, merge or delete");
const form = code(read("src/components/security-passport/InternationalCredentialForm.tsx"));
const newRoute = code(read("src/routes/_authenticated.passport.credentials.new.tsx"));
check(
  /const duplicates = initial \? \[\] : likelyDuplicatesOf\(existingCredentials, selected\?\.code\)/.test(
    form,
  ),
  "the warning is for a NEW record of the selected credential, not for a correction",
);
check(
  /data-duplicate-open=\{d\.id\}/.test(form) &&
    /to="\/passport\/entry\/\$kind\/\$entryId"[\s\S]{0,80}entryId: d\.id/.test(form),
  "each existing record can be opened from the warning",
);
check(
  /disabled=\{!definitions \|\| !selected \|\| duplicateUnanswered\}/.test(form) &&
    /if \(duplicateUnanswered && !savedId\.current\)/.test(form),
  "continuing and saving wait for the holder's answer (also when a ?code= link skips step 1)",
);
check(
  /data-duplicate-confirm/.test(form) && /Ingenting raderas eller slås ihop automatiskt/.test(form),
  "a separate record stays possible, and the holder is told nothing is deleted or merged",
);
check(
  /existingCredentialsOf\(snapshot\.holder\.claims\)/.test(newRoute) &&
    /\.catch\(\(\) => undefined\)/.test(newRoute) &&
    /existingCredentials=\{existing\}/.test(newRoute),
  "the route reads the holder's records best-effort: an unreadable Passport never blocks the form",
);

// ── 3 · current is not verified ─────────────────────────────────────────
console.log("3 · 'current' is the date axis, never a word for verified");
const i18n = read("src/lib/security-passport/i18n.ts");
const wallet = code(read("src/components/security-passport/CredentialWallet.tsx"));
check(
  /"lifecycle\.active": "Gällande"/.test(i18n) &&
    /"lifecycle\.active": "Current"/.test(i18n) &&
    !/"lifecycle\.active": "Active"/.test(i18n),
  "the lifecycle word is Gällande / Current, not Active",
);
check(
  /copy\("Gällande nu", "Current now"\)/.test(wallet) && !/copy\("Aktiva", "Active"\)/.test(wallet),
  "the overview count says current, not active",
);
check(
  /Vad dina registrerade meriter visar/.test(wallet) &&
    !/Titel som meriterna ger stöd för/.test(wallet) &&
    /ersätter inte ditt yrke i Profil och är ingen verifiering i sig/.test(wallet),
  "the derived summary is what registered credentials show, kept apart from the Profile occupation",
);

// ── 4 · the reviewer queue ──────────────────────────────────────────────
console.log("4 · a failed read is never 'nothing to review'");
const review = code(read("src/routes/_authenticated.passport-review.tsx"));
check(
  /queueState === "loading"[\s\S]{0,400}queueState === "failed" \? null : queue\.length === 0/.test(
    review,
  ),
  "the queue's empty state is drawn only for a read that answered",
);
check(
  /readFailed \? null : rows\.length === 0/.test(review),
  "and the disputes' empty state likewise",
);
check(
  /setIsVerifier\("failed"\)/.test(review) &&
    /if \(isVerifier === "failed"\)/.test(review) &&
    /if \(q\.isError\) \{[\s\S]{0,200}vq\.whoamiFailed/.test(review),
  "a failed access check is said as a failed check, with a retry — never as 'no access'",
);
check(
  /data-vq-type-filter/.test(review) &&
    /data-vq-search/.test(review) &&
    /\{shown\.map\(\(item\) =>/.test(review) &&
    /data-vq-state="no-match"/.test(review),
  "the reviewer can narrow by merit type and text, and a narrowed-out list says so",
);
check(
  /data-vq-decision-version/.test(review) && /"vq\.decisionAppliesTo":/.test(i18n),
  "the decision states which version it applies to",
);

if (failures.length) {
  console.error(`\npassport-launch-completion-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nPassport launch completion: ${assertions} of ${assertions} assertions passed.`);
