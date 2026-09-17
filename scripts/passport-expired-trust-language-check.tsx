// What may be said about an entry that is no longer current.
//
// ── THE DEFECT THIS EXISTS FOR ─────────────────────────────────────────
//
// There was one sentence for every expired entry:
//
//     "This entry was verified but its validity period has ended."
//
// It was printed under a credential the holder typed in themselves, that
// nobody ever looked at — on the SHARED page, where a stranger reads it. The
// day a self-declared record lapsed it acquired a verification history.
//
// Two compact surfaces did the same thing with the word "PREVIOUSLY
// VERIFIED": the credential verification page printed it after the lifecycle
// word of every non-current credential, and the shared card printed it for any
// stored `verified`, which a CQrityjob document review is.
//
// ── THE RULE ───────────────────────────────────────────────────────────
//
// Expiry does not confer a past. What an expired entry "was" is its STORED
// standing, resolved through the same `effectiveTrust` every chip uses:
//
//   self-declared      the holder's own statement; nobody checked it
//   document provided  a document was attached; nobody reviewed it
//   documented         CQrityjob reviewed a document; the issuer did not confirm
//   source-confirmed   confirmed by the party it concerns (the structural
//                      employer-attestation path, and only that)
//
// There is no "verified" sentence, because there is no effective standing
// called verified: `effectiveTrust` resolves every stored `verified` to one of
// the last two. That is asserted below rather than assumed.
//
// Run: bun run passport-expired-trust-language:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { PassportLangProvider } from "../src/lib/security-passport/use-passport-copy";
import { passportT, type PassportLang } from "../src/lib/security-passport/i18n";
import {
  effectiveTrust,
  expiredNoteKey,
  historicalTrustWordKey,
  type ProvenanceBearing,
} from "../src/lib/security-passport/trust-presentation";
import { LifecycleNote } from "../src/components/security-passport/LifecycleChip";
import { RecipientPassportCard } from "../src/components/security-passport/live/RecipientPassportCard";
import { RecipientCredentialList } from "../src/components/security-passport/live/RecipientCredentialList";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";

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

const html = (node: React.ReactNode, lang: PassportLang) =>
  renderToStaticMarkup(
    <I18nProvider>
      <PassportLangProvider lang={lang}>{node}</PassportLangProvider>
    </I18nProvider>,
  );
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** Every word that would claim a check happened. Matched case-insensitively,
 *  in both languages, against text a self-declared entry renders. */
const CHECK_LANGUAGE =
  /verifi|bekräft|confirm|dokumenterad|documented|granska|review|kontrollerad av|checked by cqrityjob|source/i;

const SELF: ProvenanceBearing = { assertionLevel: "self_declared", subjectKind: "credential" };
const FILE: ProvenanceBearing = { assertionLevel: "document_provided", subjectKind: "credential" };
const REVIEWED: ProvenanceBearing = {
  assertionLevel: "verified",
  verifierName: "CQrityjob",
  verificationMethod: "document_review",
  subjectKind: "credential",
};
const ISSUER_NAMED: ProvenanceBearing = {
  assertionLevel: "verified",
  verifierName: "Polismyndigheten",
  verificationMethod: "issuer_confirmation",
  subjectKind: "credential",
};
const EMPLOYER: ProvenanceBearing = {
  assertionLevel: "verified",
  verifierName: "Nordvakt AB",
  verificationMethod: "employer_confirmation",
  subjectKind: "employment",
};

/* ------------------------------------------------------------------ */
console.log("\n1 · the four stored standings, and the sentence each one earns");

check(
  effectiveTrust(SELF) === "self_declared" &&
    effectiveTrust(FILE) === "document_provided" &&
    effectiveTrust(REVIEWED) === "documented" &&
    effectiveTrust(EMPLOYER) === "source_confirmed",
  "the fixtures are the four effective standings the trust model knows",
);
check(
  effectiveTrust(ISSUER_NAMED) === "documented",
  "a stored `verified` with an issuer's NAME is documented — a name is not a source",
);
{
  // "verified + expired, if that is a supported state": it is not a separate
  // state. Every stored `verified` resolves to documented or source-confirmed.
  const methods = [null, "document_review", "issuer_confirmation", "employer_confirmation", "x"];
  const names = [null, "CQrityjob", "Nordvakt AB"];
  const kinds = ["credential", "employment"] as const;
  const seen = new Set<string>();
  for (const verificationMethod of methods)
    for (const verifierName of names)
      for (const subjectKind of kinds)
        seen.add(
          effectiveTrust({
            assertionLevel: "verified",
            verificationMethod,
            verifierName,
            subjectKind,
          }),
        );
  check(
    [...seen].sort().join() === "documented,source_confirmed",
    "every stored `verified` resolves to documented or source-confirmed — there is no fifth sentence to write",
  );
}

for (const lang of ["sv", "en"] as const) {
  const note = (e: ProvenanceBearing) => passportT(expiredNoteKey(e), lang);
  check(
    !CHECK_LANGUAGE.test(note(SELF).replace(/inte kontrollerats|was not checked/i, "")) &&
      /(innehavarens egen|holder's own statement)/i.test(note(SELF)) &&
      /(inte kontrollerats|was not checked)/i.test(note(SELF)),
    `${lang} · self-declared + expired: the holder's own statement, not checked — and no verification word`,
  );
  check(
    /(bifogades|was attached)/i.test(note(FILE)) &&
      /(inte granskats|was not reviewed)/i.test(note(FILE)) &&
      !/verifi|bekräft|confirm|dokumenterad\b|documented/i.test(note(FILE)),
    `${lang} · document provided + expired: a file was attached and NOT reviewed`,
  );
  check(
    /(dokumenterad|documented)/i.test(note(REVIEWED)) &&
      /CQrityjob/.test(note(REVIEWED)) &&
      /(bekräftade den inte|did not confirm)/i.test(note(REVIEWED)) &&
      !/verifierad|was verified|källbekräftad|source-confirmed/i.test(note(REVIEWED)),
    `${lang} · documented + expired: CQrityjob reviewed a document; never "verified", never source-confirmed`,
  );
  check(
    /(källbekräftad|source-confirmed)/i.test(note(EMPLOYER)) && !/CQrityjob/.test(note(EMPLOYER)),
    `${lang} · source-confirmed + expired: says so, and does not credit CQrityjob`,
  );
  check(
    new Set([SELF, FILE, REVIEWED, EMPLOYER].map(note)).size === 4 &&
      [SELF, FILE, REVIEWED, EMPLOYER].every((e) =>
        /(giltighetstiden har gått ut|validity period has ended)/i.test(note(e)),
      ),
    `${lang} · four different sentences, and every one states that the validity ended`,
  );
  check(
    !/var verifierad men|was verified but/i.test(
      [SELF, FILE, REVIEWED, EMPLOYER].map(note).join(" "),
    ),
    `${lang} · the blanket "was verified but…" sentence is gone for every standing`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2 · the compact trust word beside a non-current lifecycle word");

for (const lang of ["sv", "en"] as const) {
  const word = (e: ProvenanceBearing) => passportT(historicalTrustWordKey(e), lang);
  const previously = passportT("assertion.verified.historical", lang);
  check(
    word(SELF) === passportT("assertion.self_declared", lang) &&
      word(FILE) === passportT("assertion.document_provided", lang) &&
      word(REVIEWED) === passportT("trust.level.documented", lang) &&
      word(ISSUER_NAMED) === passportT("trust.level.documented", lang),
    `${lang} · self-declared, document-provided and documented keep their own level word`,
  );
  check(
    word(EMPLOYER) === previously &&
      [SELF, FILE, REVIEWED, ISSUER_NAMED].every((e) => word(e) !== previously),
    `${lang} · "${previously}" is earned by a source confirmation and by nothing else`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3 · rendered: no surface hands a self-declared entry verification language");

for (const lang of ["sv", "en"] as const) {
  const rendered = html(<LifecycleNote state="expired" entry={SELF} />, lang);
  check(
    /data-lifecycle-note-trust="self_declared"/.test(rendered) &&
      !CHECK_LANGUAGE.test(text(rendered).replace(/inte kontrollerats|was not checked/i, "")),
    `${lang} · LifecycleNote(expired, self-declared) renders no verification word`,
  );
  check(
    html(<LifecycleNote state="active" entry={REVIEWED} />, lang) === "" &&
      html(<LifecycleNote state="expired" entry={REVIEWED} />, lang).includes(
        passportT("lifecycle.expiredNote.documented", lang),
      ),
    `${lang} · a current entry gets no note; an expired reviewed one gets the documented sentence`,
  );
}

const claimOf = (key: string, over: Record<string, unknown>) => ({
  key,
  type: "licence",
  title: `Credential ${key}`,
  credential_code: null,
  issuer: "Issuer",
  jurisdiction: "SE",
  sub_jurisdiction: null,
  scope_limited: false,
  authorisation_scope: null,
  issued_on: "2020-01-01",
  valid_until: "2021-01-01",
  assertion: "self_declared",
  lifecycle: "active",
  verified_at: null,
  verifier_organisation: null,
  verification_method: null,
  ...over,
});
for (const lang of ["sv", "en"] as const) {
  const payload = (claims: unknown[]) =>
    ({
      status: "active",
      package: "selected_merits",
      focus: "passport",
      purpose: null,
      locale: lang,
      expires_at: "2026-10-17",
      authorised_at: "2026-09-17",
      last_updated: "2026-09-17",
      holder: "Mostafa Alshawi",
      privacy_mode: "full_name",
      profession_slug: null,
      jurisdiction: "SE",
      sub_jurisdiction: null,
      verified_claims: claims,
      verified_experience: [],
      verified_experience_days: 0,
      rules: [],
    }) as unknown as RecipientPayloadActive;

  // A share whose ONLY content is an expired self-declared credential. Any
  // verification word on either surface can only have come from that row.
  const selfOnly = buildRecipientPresentation(payload([claimOf("s", {})]), "2026-09-17");
  check(
    selfOnly.credentials[0]?.lifecycle === "expired" &&
      selfOnly.credentials[0]?.assertion === "self_declared",
    `${lang} · fixture: the shared credential really is expired and self-declared`,
  );
  const list = text(html(<RecipientCredentialList credentials={selfOnly.credentials} />, lang));
  const card = text(html(<RecipientPassportCard presentation={selfOnly} />, lang));
  const previously = passportT("assertion.verified.historical", lang);
  check(
    !list.includes(previously) &&
      !/var verifierad|was verified/i.test(list) &&
      list.includes(passportT("lifecycle.expiredNote.self_declared", lang)),
    `${lang} · shared credential list: an expired self-declared entry is described as the holder's own`,
  );
  check(
    !card.includes(previously) && !/var verifierad|was verified/i.test(card),
    `${lang} · shared card: no "${previously}" on an expired self-declared entry`,
  );

  // The document review: documented, never "previously verified".
  const reviewed = buildRecipientPresentation(
    payload([
      claimOf("r", {
        assertion: "verified",
        verified_at: "2020-02-01T00:00:00Z",
        verifier_organisation: "CQrityjob",
        verification_method: "document_review",
      }),
    ]),
    "2026-09-17",
  );
  const reviewedCard = text(html(<RecipientPassportCard presentation={reviewed} />, lang));
  const reviewedList = text(
    html(<RecipientCredentialList credentials={reviewed.credentials} />, lang),
  );
  check(
    !reviewedCard.includes(previously) &&
      reviewedCard.includes(passportT("trust.level.documented", lang)) &&
      reviewedList.includes(passportT("lifecycle.expiredNote.documented", lang)),
    `${lang} · an expired CQrityjob document review reads documented on both shared surfaces`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n4 · structurally: nobody can print the old sentence or skip the standing");

const chip = code(read("src/components/security-passport/LifecycleChip.tsx"));
check(
  /entry: ProvenanceBearing;/.test(chip) && !/entry\?: ProvenanceBearing/.test(chip),
  "LifecycleNote REQUIRES the entry — a caller cannot omit the standing and inherit a default",
);
check(
  /pt\(expiredNoteKey\(entry\)\)/.test(chip) && !/lifecycle\.expiredNote"/.test(chip),
  "and it chooses its sentence through expiredNoteKey, never a literal key",
);
const copy = read("src/lib/security-passport/i18n.ts");
check(
  !/"lifecycle\.expiredNote":/.test(copy) &&
    (copy.match(/"lifecycle\.expiredNote\.self_declared":/g) ?? []).length === 2,
  "the unkeyed sentence no longer exists in either language",
);
for (const file of [
  "src/components/security-passport/live/CredentialVerificationPage.tsx",
  "src/components/security-passport/live/RecipientPassportCard.tsx",
]) {
  const src = code(read(file));
  check(
    /historicalTrustWordKey\(/.test(src) && !/assertion\.verified\.historical/.test(src),
    `${file.split("/").pop()} takes its historical word from the central function`,
  );
}
{
  const callers = [
    "src/components/security-passport/ClaimRow.tsx",
    "src/components/security-passport/ExperienceTimeline.tsx",
    "src/components/security-passport/live/RecipientCredentialList.tsx",
    "src/routes/_authenticated.passport.entry.$kind.$entryId.tsx",
  ];
  check(
    callers.every((f) => /<LifecycleNote\s+state=\{[^}]+\}\s+entry=\{/.test(code(read(f)))),
    "all four LifecycleNote call sites pass the entry's stored standing",
  );
}

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(
    `passport-expired-trust-language-check FAILED (${failures.length} of ${assertions}):`,
  );
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Passport expired-trust language: ${assertions} of ${assertions} assertions passed.`);
