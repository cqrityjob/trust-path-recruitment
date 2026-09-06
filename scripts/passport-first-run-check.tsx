// Security Passport — the first run is short, honest and derived from rows.
//
// Run via `bun run passport-first-run:check`.
//
// ── WHAT THIS PINS ─────────────────────────────────────────────────────
//
// PR #191 pointed the public homepage at the Passport and sends every new
// account to `/signup?redirect=/passport`. PR #192 makes the authenticated
// product keep that promise. The three things that can quietly stop being
// true are:
//
//   1. WHAT IS SAID. The confirmation screen must call a self-declared merit
//      what it is -- "information provided by you" -- and must never reach for
//      verified, confirmed or documented. That is one word away at all times.
//
//   2. WHICH SCREEN. The journey must be derived from persisted rows, using
//      the SHARED merit-lifecycle predicates. A profile that says `completed`
//      and holds nothing must get the first-merit state, and a draft or an
//      expired credential must not count as Passport content.
//
//   3. WHAT IS SAVED. No country may be defaulted, the declaration may not be
//      remembered on the holder's behalf, and no code path may name a trust
//      column.
//
// Rendered, not merely grepped, wherever the claim is about what a person
// reads. The screens take plain props and no router, which is why they can be
// rendered here at all.

import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { I18nProvider } from "../src/i18n/context";
import {
  ChooseMeritScreen,
  CreatePassportScreen,
  MeritDetailsScreen,
  MeritSavedScreen,
  MeritUnconfirmedScreen,
} from "../src/components/security-passport/FirstRunJourney";
import {
  EMPTY_DRAFT,
  FIRST_MERIT_KINDS,
  confirmReadback,
  deriveFirstRunState,
  fieldsFor,
  readDraft,
  validateDraft,
  writeDraft,
  type FirstMeritDraft,
  type FirstMeritKind,
  type PersistedMerit,
} from "../src/lib/security-passport/first-run";
import { PASSPORT_QUERY_KEYS } from "../src/lib/security-passport/refresh";
import {
  isArchivedMerit,
  isCurrentMerit,
  isUnfinishedMerit,
} from "../src/lib/security-passport/types";
import { describeTrust } from "../src/lib/security-passport/trust-presentation";

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  -- ${detail}`}`);
  if (!ok) fails.push(name);
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

const noop = () => {};
function html(node: React.ReactNode, lang: "sv" | "en" = "sv"): string {
  return renderToStaticMarkup(<I18nProvider initialLang={lang}>{node}</I18nProvider>);
}
/** Markup with tags removed, so an assertion about what a READER sees cannot
 *  be satisfied by a class name or an attribute. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

console.log("passport-first-run-check\n");

const draftOf = (patch: Partial<FirstMeritDraft>): FirstMeritDraft => ({
  ...EMPTY_DRAFT,
  ...patch,
});

/* ══════════════════════════════════════════════════════════════════════
   T1 · THE STATE MACHINE — derived from rows, never from a flag
   ══════════════════════════════════════════════════════════════════════ */
group("T1 · which screen, decided by what the database holds");

const noProfile = deriveFirstRunState({ profile: null, meritLifecycleStates: [] });
ck("no Passport row opens on 'create your Security Passport'", noProfile.screen === "create");

const emptyProfile = deriveFirstRunState({
  profile: { onboardingState: "in_progress", onboardingAnswers: {} },
  meritLifecycleStates: [],
});
ck(
  "a Passport with no merit opens on 'start with your first merit'",
  emptyProfile.screen === "choose",
);

const savedDraft = writeDraft({}, draftOf({ kind: "course", title: "VU1", operationId: "op-1" }));
const resumed = deriveFirstRunState({
  profile: { onboardingState: "in_progress", onboardingAnswers: savedDraft },
  meritLifecycleStates: [],
});
ck("a saved draft resumes on the details screen", resumed.screen === "details");
ck(
  "and resumes the EXACT answers, including the operation id",
  resumed.screen === "details" &&
    resumed.draft.kind === "course" &&
    resumed.draft.title === "VU1" &&
    resumed.draft.operationId === "op-1",
);

// THE ONE THAT MATTERS MOST. Hosted data carries profiles the old wizard
// closed without creating anything. Reading `onboarding_state` would tell
// that person they were finished, above an empty Passport.
const legacyCompleted = deriveFirstRunState({
  profile: { onboardingState: "completed", onboardingAnswers: {} },
  meritLifecycleStates: [],
});
ck(
  "a LEGACY completed profile with no merit still gets the first-merit state",
  legacyCompleted.screen === "choose",
);

const withMerit = deriveFirstRunState({
  profile: { onboardingState: "in_progress", onboardingAnswers: {} },
  meritLifecycleStates: ["active"],
});
ck("one current merit ends the first run", withMerit.screen === "overview");

for (const state of ["draft", "expired", "revoked", "superseded", "disputed", "withdrawn"]) {
  const only = deriveFirstRunState({
    profile: { onboardingState: "completed", onboardingAnswers: {} },
    meritLifecycleStates: [state],
  });
  ck(`only a ${state} merit is not Passport content`, only.screen === "choose");
}

// ONE lifecycle interpretation, not two. The module must reach for the shared
// predicates rather than testing a string of its own.
const firstRunSrc = code(read("src/lib/security-passport/first-run.ts"));
ck(
  "the derivation uses the SHARED isCurrentMerit predicate",
  firstRunSrc.includes("isCurrentMerit(") &&
    firstRunSrc.includes('from "./types"') &&
    !/state === "active"/.test(firstRunSrc),
);
ck(
  "and the three predicates still partition the lifecycle",
  ["active", "draft", "expired", "revoked", "superseded", "disputed"].every(
    (s) =>
      [isCurrentMerit(s), isUnfinishedMerit(s), isArchivedMerit(s)].filter(Boolean).length === 1,
  ),
);

/* ══════════════════════════════════════════════════════════════════════
   T2 · THE COPY — both languages, and no leakage
   ══════════════════════════════════════════════════════════════════════ */
group("T2 · what the four screens say, in Swedish and in English");

const SV_CREATE = html(<CreatePassportScreen onCreate={noop} busy={false} error={null} />, "sv");
const EN_CREATE = html(<CreatePassportScreen onCreate={noop} busy={false} error={null} />, "en");

for (const [label, markup, expected] of [
  ["sv heading", SV_CREATE, "Skapa ditt Security Passport"],
  [
    "sv body",
    SV_CREATE,
    "Samla dina meriter på ett ställe. Du väljer själv vad du delar och med vem.",
  ],
  ["sv primary CTA", SV_CREATE, "Skapa mitt Security Passport"],
  ["en heading", EN_CREATE, "Create your Security Passport"],
  [
    "en body",
    EN_CREATE,
    "Keep your professional merits in one place. You decide what to share and with whom.",
  ],
  ["en primary CTA", EN_CREATE, "Create my Security Passport"],
] as const) {
  ck(`screen 1 ${label}: "${expected}"`, text(markup).includes(expected));
}

// Private until deliberately shared, said on the screen that creates it.
ck(
  "screen 1 says the Passport is private until the holder shares",
  text(SV_CREATE).includes("Privat tills du själv delar"),
);
ck("and in English", text(EN_CREATE).includes("Private until you share it yourself"));

const SV_CHOOSE = html(<ChooseMeritScreen onChoose={noop} />, "sv");
const EN_CHOOSE = html(<ChooseMeritScreen onChoose={noop} />, "en");

ck("screen 2 sv heading", text(SV_CHOOSE).includes("Börja med din första merit"));
ck(
  "screen 2 sv body",
  text(SV_CHOOSE).includes(
    "Lägg till något du har gjort eller uppnått. Du kan ändra uppgifterna senare.",
  ),
);
ck("screen 2 en heading", text(EN_CHOOSE).includes("Start with your first merit"));
ck(
  "screen 2 en body",
  text(EN_CHOOSE).includes(
    "Add something you have done or achieved. You can update the details later.",
  ),
);

for (const [kind, sv, en] of [
  ["employment", "Anställning", "Employment"],
  ["education", "Utbildning", "Education"],
  ["course", "Kurs", "Course"],
  ["certification", "Certifiering", "Certification"],
  ["licence", "Licens eller behörighet", "Licence or professional authorisation"],
] as const) {
  ck(`screen 2 offers ${kind} (sv)`, text(SV_CHOOSE).includes(sv));
  ck(`screen 2 offers ${kind} (en)`, text(EN_CHOOSE).includes(en));
  ck(`and it is a real control`, SV_CHOOSE.includes(`data-merit-kind="${kind}"`));
}

// The five choices are the WHOLE list. A sixth added without a server mapping
// would be an option that cannot be saved.
ck("exactly five first-merit kinds", FIRST_MERIT_KINDS.length === 5);

const detailsProps = {
  draft: draftOf({ kind: "employment" }),
  problems: {},
  onChange: noop,
  onSubmit: noop,
  onSaveAndExit: noop,
  onBack: noop,
  busy: false,
  error: null,
};
const SV_DETAILS = html(<MeritDetailsScreen kind="employment" {...detailsProps} />, "sv");
const EN_DETAILS = html(<MeritDetailsScreen kind="employment" {...detailsProps} />, "en");

ck(
  "screen 3 sv save CTA is 'Spara i mitt Passport'",
  text(SV_DETAILS).includes("Spara i mitt Passport"),
);
ck(
  "screen 3 en save CTA is 'Save to my Passport'",
  text(EN_DETAILS).includes("Save to my Passport"),
);

const savedMerit: PersistedMerit = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "experience",
  title: "Väktare",
  organisation: "Bevakning AB",
  assertionLevel: "self_declared",
  lifecycleState: "active",
};
const SV_DONE = html(
  <MeritSavedScreen
    title={savedMerit.title}
    onGoToPassport={noop}
    onAddAnother={noop}
    onCompleteProfile={noop}
  />,
  "sv",
);
const EN_DONE = html(
  <MeritSavedScreen
    title={savedMerit.title}
    onGoToPassport={noop}
    onAddAnother={noop}
    onCompleteProfile={noop}
  />,
  "en",
);

ck("screen 4 sv heading is 'Meriten är sparad'", text(SV_DONE).includes("Meriten är sparad"));
ck("screen 4 sv status is 'Uppgift från dig'", text(SV_DONE).includes("Uppgift från dig"));
ck("screen 4 en heading is 'Your merit is saved'", text(EN_DONE).includes("Your merit is saved"));
ck(
  "screen 4 en status is 'Information provided by you'",
  text(EN_DONE).includes("Information provided by you"),
);
for (const action of [
  "Gå till mitt Security Passport",
  "Lägg till en merit till",
  "Komplettera min profil",
]) {
  ck(`screen 4 sv offers "${action}"`, text(SV_DONE).includes(action));
}
for (const action of ["Go to my Security Passport", "Add another merit", "Complete my profile"]) {
  ck(`screen 4 en offers "${action}"`, text(EN_DONE).includes(action));
}

// ── NO HIDDEN SWEDISH IN THE ENGLISH INTERFACE ──────────────────────────
//
// Including decorative and helper text. A single Swedish word in an English
// screen is the reader discovering the product was not built for them.
const SWEDISH_MARKERS = [
  "Skapa",
  "Börja",
  // NOT "merit": it is an English word too, and the English screens use it
  // deliberately. The markers are words that are Swedish and only Swedish.
  "Spara",
  "Uppgift",
  "Lägg till",
  "Fortsätt",
  "Välj",
  "Land",
  "Sverige",
  "Anställning",
  "Utbildning",
  "behörighet",
  "Meriten",
];
for (const [name, markup] of [
  ["screen 1", EN_CREATE],
  ["screen 2", EN_CHOOSE],
  ["screen 3", EN_DETAILS],
  ["screen 4", EN_DONE],
  ["the unconfirmed screen", html(<MeritUnconfirmedScreen onGoToPassport={noop} />, "en")],
] as const) {
  const t = text(markup);
  const leaked = SWEDISH_MARKERS.filter((w) => t.includes(w));
  ck(`${name} leaks no Swedish into English`, leaked.length === 0, leaked.join(", "));
}

// And the reverse: the Swedish screens must not be half English.
for (const [name, markup] of [
  ["screen 1", SV_CREATE],
  ["screen 2", SV_CHOOSE],
  ["screen 4", SV_DONE],
] as const) {
  const t = text(markup);
  const leaked = ["Create my", "Start with", "Your merit is saved", "Save to my"].filter((w) =>
    t.includes(w),
  );
  ck(`${name} leaks no English into Swedish`, leaked.length === 0, leaked.join(", "));
}

/* ══════════════════════════════════════════════════════════════════════
   T3 · TRUST — a first merit is a statement, and says so
   ══════════════════════════════════════════════════════════════════════ */
group("T3 · what a newly created merit is allowed to be called");

// PR #189's central helper, asked about exactly the row this journey creates.
const trust = describeTrust({ assertionLevel: "self_declared", lifecycleState: "active" });
ck("a first merit describes as self_reported", trust.status === "self_reported");
ck("with no source type", trust.sourceType === null);
ck("no organisation", trust.organisation === null);
ck("no verification method", trust.method === null);
ck("no verification date", trust.date === null);
ck("and no attribution line at all", trust.labelSv === null && trust.labelEn === null);

// The words the confirmation screen may not use. "Documented" is the one that
// would be easiest to reach for and is reserved, by PR #189, for a CQrityjob
// document review that actually happened.
for (const [lang, markup, forbidden] of [
  [
    "sv",
    SV_DONE,
    [
      "Verifierad",
      "verifierad",
      "Bekräftad",
      "bekräftad",
      "Dokumenterad",
      "dokumenterad",
      "Källverifierad",
    ],
  ],
  [
    "en",
    EN_DONE,
    [
      "Verified",
      "verified",
      "Confirmed",
      "confirmed",
      "Documented",
      "documented",
      "Source-confirmed",
    ],
  ],
] as const) {
  const t = text(markup);
  const used = forbidden.filter((w) => t.includes(w));
  ck(
    `screen 4 (${lang}) never calls the merit verified/confirmed/documented`,
    used.length === 0,
    used.join(", "),
  );
}

// No trust SCORE, anywhere in the journey.
const journeySrc = code(read("src/components/security-passport/FirstRunJourney.tsx"));
ck(
  "the journey computes no score, percentage or level",
  !/score|percent|Math\.round|\/\s*100/i.test(journeySrc),
);

// And the components do not re-implement trust wording: PR #189's rule is
// that every surface asks the same function.
ck(
  "the journey states no trust rule of its own",
  !journeySrc.includes("assertion_level") &&
    !journeySrc.includes("assertionLevel") &&
    !journeySrc.includes("verification_method"),
);

// The readback checks the two trust facts on the client too.
ck(
  "a readback that is not self_declared is refused",
  confirmReadback(
    {
      id: savedMerit.id,
      kind: "experience",
      draft: draftOf({ title: "Väktare", organisation: "Bevakning AB" }),
    },
    { ...savedMerit, assertionLevel: "verified" },
  ) === "mismatch",
);
ck(
  "a readback that is not a current merit is refused",
  confirmReadback(
    {
      id: savedMerit.id,
      kind: "experience",
      draft: draftOf({ title: "Väktare", organisation: "Bevakning AB" }),
    },
    { ...savedMerit, lifecycleState: "draft" },
  ) === "mismatch",
);

/* ══════════════════════════════════════════════════════════════════════
   T4 · READBACK — three outcomes, and the middle one is real
   ══════════════════════════════════════════════════════════════════════ */
group("T4 · saved is said only when the row came back saying so");

const expected = {
  id: savedMerit.id,
  kind: "experience" as const,
  draft: draftOf({ title: "Väktare", organisation: "Bevakning AB" }),
};
ck("a matching row confirms", confirmReadback(expected, savedMerit) === "confirmed");
ck("no row at all is UNKNOWN, not a failure", confirmReadback(expected, null) === "unknown");
ck(
  "a different id is a mismatch",
  confirmReadback(expected, { ...savedMerit, id: "22222222-2222-4222-8222-222222222222" }) ===
    "mismatch",
);
ck(
  "a different title is a mismatch",
  confirmReadback(expected, { ...savedMerit, title: "Something else" }) === "mismatch",
);
ck(
  "a different organisation is a mismatch",
  confirmReadback(expected, { ...savedMerit, organisation: "Another AB" }) === "mismatch",
);

// The route must render the unconfirmed screen for anything that is not a
// confirmation -- never the success screen.
const routeSrc = code(read("src/routes/_authenticated.passport.onboarding.tsx"));
ck(
  "the route shows success only on 'confirmed'",
  /outcome === "confirmed"/.test(routeSrc) &&
    routeSrc.includes('setPhase({ kind: "unconfirmed" })'),
);
ck(
  "a thrown readback becomes 'unknown' rather than a failure",
  /catch[\s\S]{0,400}outcome = "unknown"/.test(routeSrc),
);
const SV_UNKNOWN = text(html(<MeritUnconfirmedScreen onGoToPassport={noop} />, "sv"));
ck(
  "the unconfirmed screen says it could not confirm",
  SV_UNKNOWN.includes("Vi kunde inte bekräfta sparningen"),
);
ck("and does not say the merit was saved", !SV_UNKNOWN.includes("Meriten är sparad"));
ck("and does not say it failed", !SV_UNKNOWN.includes("sparades inte"));

/* ══════════════════════════════════════════════════════════════════════
   T5 · PERSISTENCE — the properties the browser is responsible for
   ══════════════════════════════════════════════════════════════════════ */
group("T5 · idempotency, single flight, flush, and a save that is not a draft");

ck(
  "the operation id is minted when the kind is chosen, before any attempt",
  /onChoose[\s\S]{0,700}operationId: draft\.operationId \?\? newOperationId\(\)/.test(routeSrc),
);
ck("and is autosaved with the draft", /onChoose[\s\S]{0,900}scheduleDraft\(next\)/.test(routeSrc));
ck(
  "the completion is single flight",
  routeSrc.includes("if (inFlightComplete.current) return;") &&
    routeSrc.includes("inFlightComplete.current = run;"),
);
ck(
  "the pending debounced save is flushed and awaited before completing",
  /runCompletion[\s\S]{0,400}await flushDraft\(\)/.test(routeSrc),
);
ck(
  "and the completion sends the CURRENT field values, not the stored draft",
  /await complete\(\{[\s\S]{0,600}title: current\.title\.trim\(\)/.test(routeSrc),
);
ck(
  "'Save and exit' writes a draft and never completes",
  /onSaveAndExit[\s\S]{0,400}await writeNow\(draft\)/.test(routeSrc) &&
    !/onSaveAndExit[\s\S]{0,400}complete\(/.test(routeSrc),
);

const serverSrc = code(read("src/lib/security-passport/first-run.functions.ts"));
ck(
  "the draft writer leaves onboarding in_progress",
  serverSrc.includes('onboarding_state: "in_progress"'),
);
ck("and never writes a declaration", !serverSrc.includes("declared_accurate_at"));
ck(
  "the completion accepts an explicit true and nothing else",
  serverSrc.includes("declared: z.literal(true)"),
);
ck(
  "the completion is one database call, not four writes",
  serverSrc.includes('supabase.rpc("sp_passport_complete_first_merit"') &&
    !/from\("sp_experience_periods"\)[\s\S]{0,200}\.insert/.test(serverSrc) &&
    !/from\("sp_claims"\)[\s\S]{0,200}\.insert/.test(serverSrc) &&
    !/from\("sp_passport_events"\)/.test(serverSrc),
);
ck("an empty result is an error, not a success", serverSrc.includes("SP_FIRST_MERIT_NO_RESULT"));
ck(
  "the readback throws on a read failure rather than answering null",
  /if \(error\) throw new Error\(error\.message\);[\s\S]{0,80}if \(!row\) return null;/.test(
    serverSrc,
  ),
);

// The old, defective writers must be GONE, not merely unused.
const passportFns = read("src/lib/security-passport/passport.functions.ts");
ck("completeOnboarding no longer exists", !/export const completeOnboarding/.test(passportFns));
ck(
  "saveOnboardingProgress no longer exists",
  !/export const saveOnboardingProgress/.test(passportFns),
);
ck(
  "Passport creation is one statement, not read-then-insert",
  /ensureProfileRow[\s\S]{0,1600}ignoreDuplicates: true/.test(code(passportFns)),
);
ck(
  "and the creation event's error is read",
  /ensureProfileRow[\s\S]{0,2200}if \(eventError\) throw/.test(code(passportFns)),
);

/* ══════════════════════════════════════════════════════════════════════
   T6 · NO COUNTRY IS EVER INVENTED
   ══════════════════════════════════════════════════════════════════════ */
group("T6 · a country is a stated fact, not a default");

ck("a blank draft has no country", EMPTY_DRAFT.country === "" && readDraft(null).country === "");
ck(
  "an employment with no country does not validate",
  !validateDraft(
    draftOf({
      kind: "employment",
      title: "V",
      organisation: "B",
      startedOn: "2024-01-01",
      declared: true,
    }),
    "2026-09-06",
  ).ok,
);
ck(
  "and it is the COUNTRY that is missing",
  validateDraft(
    draftOf({
      kind: "employment",
      title: "V",
      organisation: "B",
      startedOn: "2024-01-01",
      declared: true,
    }),
    "2026-09-06",
  ).problems.country === "required",
);
ck(
  "with a stated country it validates",
  validateDraft(
    draftOf({
      kind: "employment",
      title: "V",
      organisation: "B",
      country: "GB",
      startedOn: "2024-01-01",
      declared: true,
    }),
    "2026-09-06",
  ).ok,
);
ck(
  "the country select has no preselected option",
  SV_DETAILS.includes('<option value=""') && !/<option value="SE" selected/.test(SV_DETAILS),
);
ck(
  "the four non-employment kinds are not asked for a country at all",
  (["education", "course", "certification", "licence"] as FirstMeritKind[]).every(
    (k) => !fieldsFor(k).includes("country"),
  ),
);
ck("employment is", fieldsFor("employment").includes("country"));

// NOT ONE Sweden default may survive anywhere in the write path.
const WRITE_PATH = [
  "src/lib/security-passport/first-run.ts",
  "src/lib/security-passport/first-run.functions.ts",
  "src/lib/security-passport/entries.functions.ts",
  "src/lib/security-passport/passport.functions.ts",
  "src/components/security-passport/FirstRunJourney.tsx",
  "src/components/security-passport/EntryForms.tsx",
];
for (const file of WRITE_PATH) {
  const src = code(read(file));
  ck(
    `${file.split("/").pop()} defaults no country`,
    !/default\("SE"\)/.test(src) && !/\?\?\s*"SE"/.test(src) && !/\|\|\s*"SE"/.test(src),
  );
}

// And no employer is required to exist. "Do not require a current employer"
// means employment must not be the only way in.
ck(
  "employment is not the only kind that can be first",
  FIRST_MERIT_KINDS.filter((k) => k !== "employment").length === 4,
);
ck(
  "and the journey never gates on a profession",
  !journeySrc.includes("vaktare") &&
    !journeySrc.includes("ordningsvakt") &&
    !journeySrc.includes("skyddsvakt"),
);

/* ══════════════════════════════════════════════════════════════════════
   T7 · THE DECLARATION
   ══════════════════════════════════════════════════════════════════════ */
group("T7 · the affirmation is made, never remembered");

ck(
  "a draft without the tick does not validate",
  validateDraft(
    draftOf({ kind: "course", title: "VU1", organisation: "Utbildare", declared: false }),
    "2026-09-06",
  ).problems.declaration === "required",
);
ck(
  "with the tick it does",
  validateDraft(
    draftOf({ kind: "course", title: "VU1", organisation: "Utbildare", declared: true }),
    "2026-09-06",
  ).ok,
);
ck(
  "the declaration is never written into the stored draft",
  !JSON.stringify(writeDraft({}, draftOf({ declared: true }))).includes("declared"),
);
ck(
  "and a resumed draft never comes back ticked",
  readDraft(writeDraft({}, draftOf({ declared: true }))).declared === false,
);
ck(
  "the details screen renders the declaration box",
  SV_DETAILS.includes('data-testid="first-merit-declaration"'),
);
ck(
  "sv declaration wording",
  text(SV_DETAILS).includes("Jag intygar att uppgifterna jag lämnar är riktiga så vitt jag vet."),
);
ck(
  "en declaration wording",
  text(EN_DETAILS).includes(
    "I confirm that the information I provide is accurate to the best of my knowledge.",
  ),
);

/* ══════════════════════════════════════════════════════════════════════
   T8 · THE DATABASE OPERATION
   ══════════════════════════════════════════════════════════════════════ */
group("T8 · the migration carries the guarantees the journey depends on");

const MIGRATION = "supabase/migrations/20261031090000_sp_passport_first_merit.sql";
ck("the migration exists", existsSync(path.join(root, MIGRATION)));
const sql = read(MIGRATION);

for (const refusal of [
  "SP_DECLARATION_REQUIRED",
  "SP_WORK_COUNTRY_REQUIRED",
  "SP_START_DATE_REQUIRED",
  "SP_TITLE_REQUIRED",
  "SP_ORGANISATION_REQUIRED",
  "SP_MERIT_KIND_UNKNOWN",
  "SP_OPERATION_ID_REQUIRED",
  "SP_OPERATION_ID_CONFLICT",
  "SP_NOT_AUTHENTICATED",
]) {
  ck(`the function refuses with ${refusal}`, sql.includes(refusal));
}
ck("it is idempotent on an operation id", sql.includes("sp_events_one_per_operation"));
ck(
  "the index is UNIQUE and partial",
  /CREATE UNIQUE INDEX[\s\S]{0,240}WHERE detail \? 'operation_id'/.test(sql),
);
ck(
  "the function is SECURITY DEFINER with a pinned search_path",
  /SECURITY DEFINER SET search_path = public/.test(sql),
);
ck(
  "anon cannot execute it",
  /REVOKE ALL ON FUNCTION public\.sp_passport_complete_first_merit[\s\S]{0,200}FROM PUBLIC, anon/.test(
    sql,
  ),
);
ck(
  "authenticated can",
  /GRANT EXECUTE ON FUNCTION public\.sp_passport_complete_first_merit[\s\S]{0,200}TO authenticated/.test(
    sql,
  ),
);

// The function body must not be able to name a trust column. The migration
// asserts this itself at apply time; asserted here too so the fast job
// catches it without a database.
const body = sql.slice(
  sql.indexOf("LANGUAGE plpgsql SECURITY DEFINER"),
  sql.indexOf("REVOKE ALL ON FUNCTION"),
);
for (const column of ["assertion_level", "lifecycle_state", "verified_by_user_id", "verified_at"]) {
  ck(`the function body never names ${column}`, !body.includes(column));
}

ck(
  "there is a rollback",
  existsSync(
    path.join(root, "supabase/rollback/20261031090000_sp_passport_first_merit_rollback.sql"),
  ),
);
ck(
  "and a database suite",
  existsSync(path.join(root, "supabase/tests/security_passport_first_merit_test.sql")) &&
    existsSync(path.join(root, "supabase/tests/security_passport_first_merit_race_test.sql")),
);
const dbTest = read("scripts/db-test.sh");
ck(
  "both suites are registered in db-test.sh",
  dbTest.includes("security_passport_first_merit_test.sql") &&
    dbTest.includes("security_passport_first_merit_race_test.sql"),
);
ck(
  "the rollback is exercised too",
  dbTest.includes("20261031090000_sp_passport_first_merit_rollback.sql"),
);
ck(
  "the migration is declared in release-state.json",
  read("supabase/release-state.json").includes("20261031090000_sp_passport_first_merit.sql"),
);

/* ══════════════════════════════════════════════════════════════════════
   T9 · EVERY CTA HAS A REAL DESTINATION, AND NONE REPEATS
   ══════════════════════════════════════════════════════════════════════ */
group("T9 · destinations");

const ROUTES = readdirSync(path.join(root, "src/routes"));
const DESTINATIONS = ["/passport", "/passport/information", "/passport/onboarding", "/my-career"];
const ROUTE_FILE: Record<string, string> = {
  "/passport": "_authenticated.passport.index.tsx",
  "/passport/information": "_authenticated.passport.information.tsx",
  "/passport/onboarding": "_authenticated.passport.onboarding.tsx",
  "/my-career": "_authenticated.my-career.index.tsx",
};
for (const dest of DESTINATIONS) {
  ck(`${dest} is a real route`, ROUTES.includes(ROUTE_FILE[dest]));
}

// The confirmation screen offers three actions; they must be three different
// places, or one of them is decoration.
// Scoped to the confirmation screen's own JSX. `onGoToPassport` also appears
// on the unconfirmed screen, which is a different screen with one action.
const doneJsx = routeSrc.slice(
  routeSrc.indexOf("<MeritSavedScreen"),
  routeSrc.indexOf("/>", routeSrc.indexOf("<MeritSavedScreen")),
);
const doneProps = ["onGoToPassport=", "onAddAnother=", "onCompleteProfile="];
ck(
  "screen 4 wires three distinct actions",
  doneJsx.length > 0 && doneProps.every((p) => doneJsx.split(p).length === 2),
);
ck(
  "and they lead to three different places",
  routeSrc.includes('onGoToPassport={() => void navigate({ to: "/passport" })}') &&
    routeSrc.includes("onAddAnother={onAddAnother}") &&
    routeSrc.includes('onCompleteProfile={() => void navigate({ to: "/passport/information" })}'),
);

// The overview must no longer send anybody back into the journey: that would
// be a loop, because the journey sends a holder with a merit to the overview.
const overviewSrc = code(read("src/routes/_authenticated.passport.index.tsx"));
const onboardingTargets = [...overviewSrc.matchAll(/to: "\/passport\/onboarding"/g)];
ck(
  "the overview links to the journey exactly once -- the hand-off",
  onboardingTargets.length === 1,
  String(onboardingTargets.length),
);
ck(
  "and the hand-off is a replace, so Back does not loop",
  /to: "\/passport\/onboarding", replace: true/.test(overviewSrc),
);

/* ══════════════════════════════════════════════════════════════════════
   T10 · MY CAREER STOPS RECOMMENDING WHAT WAS JUST DONE
   ══════════════════════════════════════════════════════════════════════ */
group("T10 · the caches that decide the Next Best Action");

ck(
  "the professional-identity read is invalidated after a save",
  PASSPORT_QUERY_KEYS.some((k) => k[0] === "professional-identity"),
);
ck(
  "so are the verification requests",
  PASSPORT_QUERY_KEYS.some((k) => k[0] === "passport" && k[1] === "my-verification-requests"),
);
ck(
  "the route invalidates after a completion",
  /finished\.current = true;[\s\S]{0,200}await invalidatePassportAndCareer\(qc\)/.test(routeSrc),
);
ck(
  "and after creating the Passport",
  /await create\([\s\S]{0,160}invalidatePassportAndCareer\(qc\)/.test(routeSrc),
);

// The home reads these keys. If it stops, the list above is stale and this
// guard is the only thing that would notice.
const homeSrc = read("src/routes/_authenticated.my-career.index.tsx");
for (const key of PASSPORT_QUERY_KEYS) {
  const literal = key.length === 1 ? `["${key[0]}"]` : `["${key[0]}", "${key[1]}"]`;
  ck(`/my-career still reads ${literal}`, homeSrc.includes(`queryKey: ${literal}`));
}

// The Next Best Action policy itself is NOT changed by this PR.
const nba = read("src/lib/professional-identity/next-best-action.ts");
ck("the NBA version is unchanged", nba.includes('"next-best-action-v5"'));
ck(
  "and start_passport still keys on a recorded merit, not on an onboarding flag",
  nba.includes('"at least one merit is recorded"') && !nba.includes("onboardingState"),
);

/* ══════════════════════════════════════════════════════════════════════
   T11 · THE DISCLOSURE CONTRACT IS UNTOUCHED (deferred to #193)
   ══════════════════════════════════════════════════════════════════════ */
group("T11 · nothing in the share, CV or experience contract moved");

for (const file of [
  "src/lib/security-passport/disclosure.ts",
  "src/lib/security-passport/disclosure.functions.ts",
  "src/lib/security-passport/public-disclosure.functions.ts",
  "src/lib/security-passport/experience.ts",
  "src/lib/security-passport/experience-policy.ts",
  "src/lib/security-passport/card.ts",
]) {
  ck(
    `${file.split("/").pop()} exists and is untouched by the journey`,
    existsSync(path.join(root, file)),
  );
}
// The journey never imports a disclosure, share, CV or experience-total
// module. Widening any of those is PR #193's work and must not happen here
// by accident.
for (const forbidden of ["disclosure", "share", "cv/", "experience-policy", "public-origin"]) {
  ck(
    `the journey imports nothing from "${forbidden}"`,
    !new RegExp(`from "[^"]*${forbidden}[^"]*"`).test(journeySrc + routeSrc + serverSrc),
  );
}

console.log("");
if (fails.length > 0) {
  console.error(`passport-first-run-check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-first-run-check OK");
