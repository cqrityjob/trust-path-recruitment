// Security Passport — the six profile basics are reachable, readable and
// correctable, forever.
//
// Run via `bun run passport-profile-basics:check`.
//
// ── THE DEFECT THIS PINS ───────────────────────────────────────────────
//
// Commit 9a150a6 removed "Kom igång" from the Passport navigation. The reason
// was sound — a permanent tab into a first-run wizard gives the product two
// answers to "where does my employment live" — but the six PROFILE-LEVEL
// questions had nowhere else to go, and the only surviving link to
// /passport/onboarding renders solely while the Passport is empty or partial.
// A holder who finished onboarding could no longer read, let alone correct,
// their own name, headline, profession, country, current role or declaration.
//
// A guard that only checked the domain module would pass while the holder
// still saw nothing, which is the same gap `passport-pilot-bugfix-check`
// exists to close. So this renders the real component and asserts on markup.
//
// ── AND WHAT IT MUST NEVER BECOME ──────────────────────────────────────
//
// Restoring the editor must not restore a second writer for facts that are
// domain rows, and must not let a self-reported answer touch a credential, an
// employment record or a verification state. Those are asserted against the
// server function's source, because they are properties of what it CANNOT do
// and no rendered output would reveal them.

import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { I18nProvider } from "../src/i18n/context";
import { ProfileBasicsCard } from "../src/components/security-passport/ProfileBasicsCard";
import { ONBOARDING_STEPS } from "../src/lib/security-passport/onboarding";
import {
  BASICS_DELEGATED_ACTIONS,
  BASICS_EDIT_MODE,
  BASICS_STEP_KIND,
  DATA_BEARING_COUNT,
  DATA_BEARING_STEPS,
  PROFILE_BASICS_COUNT,
  PROFILE_BASICS_STEPS,
  answeredDataCount,
  isDeclared,
  isStepAnswered,
} from "../src/lib/security-passport/profile-basics";
import { passportT, type PassportCopyKey } from "../src/lib/security-passport/i18n";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const noop = () => {};
const noopSave = async () => {};

/** The answers of a holder who has answered everything. */
const FULL: Record<string, string> = {
  "identity.displayName": "Elin Nordqvist",
  "identity.headline": "Väktare med objektsansvar",
  "profession.profession": "vaktare",
  "jurisdiction.jurisdiction": "AE-DU",
  "currentRole.employer": "Securitas Sverige AB",
  "currentRole.role": "Väktare",
  "currentRole.startedOn": "2021-03-01",
  "declaration.declared": "true",
};

function card(props: Partial<React.ComponentProps<typeof ProfileBasicsCard>> = {}) {
  return html(
    <ProfileBasicsCard
      answers={FULL}
      displayAnswers={{ "jurisdiction.jurisdiction": "Dubai, Förenade Arabemiraten" }}
      declaredAccurateAt="2026-08-20T09:00:00.000Z"
      onSave={noopSave}
      onEditProfession={noop}
      onEditWorkCountry={noop}
      onEditCurrentRole={noop}
      {...props}
    />,
  );
}

console.log("passport-profile-basics-check\n");

/* ══════════════════════════════════════════════════════════════════════
   1. THE SIX ARE THE CANONICAL SIX, AND ARE NOT RE-DECLARED
   ══════════════════════════════════════════════════════════════════════ */
console.log("THE SIX -- recovered, not invented");
{
  ck("there are exactly six profile basics", PROFILE_BASICS_COUNT === 6);
  ck(
    "and they ARE the onboarding steps, by identity rather than by copy",
    PROFILE_BASICS_STEPS === ONBOARDING_STEPS,
  );
  // The canonical ids, pinned. A rename is a product decision and has to be
  // made deliberately, not absorbed silently by a guard that only counts.
  ck(
    "the six are purpose, identity, profession, jurisdiction, currentRole, declaration",
    PROFILE_BASICS_STEPS.map((s) => s.id).join(",") ===
      "purpose,identity,profession,jurisdiction,currentRole,declaration",
  );
  ck(
    "every step has an edit mode, so none can be listed and then be unreachable",
    PROFILE_BASICS_STEPS.every((s) => BASICS_EDIT_MODE[s.id] !== undefined),
  );
  ck(
    "and every step has a kind, so none can be counted in the wrong vocabulary",
    PROFILE_BASICS_STEPS.every((s) => BASICS_STEP_KIND[s.id] !== undefined),
  );
  // One informational, four data-bearing, one declaration. The split is the
  // whole correction: it is what makes an honest count possible at all.
  ck(
    "exactly one step is informational, and it is purpose",
    PROFILE_BASICS_STEPS.filter((s) => BASICS_STEP_KIND[s.id] === "informational")
      .map((s) => s.id)
      .join(",") === "purpose",
  );
  ck(
    "exactly one step is the declaration",
    PROFILE_BASICS_STEPS.filter((s) => BASICS_STEP_KIND[s.id] === "declaration")
      .map((s) => s.id)
      .join(",") === "declaration",
  );
  ck(
    "exactly four steps are data-bearing",
    DATA_BEARING_COUNT === 4 &&
      DATA_BEARING_STEPS.map((s) => s.id).join(",") ===
        "identity,profession,jurisdiction,currentRole",
  );
  ck(
    "the informational step is not in the data-bearing set",
    !DATA_BEARING_STEPS.some((s) => s.id === "purpose"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2. A CANDIDATE CAN SEE ALL SIX QUESTIONS AND THEIR ANSWERS
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nACCESS -- all six questions, with the holder's answers");
{
  const markup = card();
  for (const step of PROFILE_BASICS_STEPS) {
    ck(`question "${step.id}" is on the page`, markup.includes(passportT(step.titleKey, "sv")));
  }
  ck("the saved display name is shown", markup.includes("Elin Nordqvist"));
  ck("the saved headline is shown", markup.includes("Väktare med objektsansvar"));
  ck("the saved employer is shown", markup.includes("Securitas Sverige AB"));
  ck("the saved start date is shown", markup.includes("2021-03-01"));
  // A code is not an answer a person can read, and flattening the emirate
  // into "AE" would make the country-wide claim the market pack refuses.
  ck(
    "the work country is shown as a place, not as the code AE-DU",
    markup.includes("Dubai, Förenade Arabemiraten"),
  );
  ck("the declaration date is shown", markup.includes("2026-08-20"));
}

/* ══════════════════════════════════════════════════════════════════════
   3. COMPLETION IS STATED TRUTHFULLY, AND NEVER OVER-COUNTED
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nCOMPLETION -- an honest count, in the right vocabulary");
{
  const readerFor = (answers: Record<string, string>) => (stepId: string, fieldId: string) =>
    answers[`${stepId}.${fieldId}`] ?? "";

  /* ── THE DEFECT THIS SECTION EXISTS FOR ──────────────────────────────
   *
   * The count used to range over all six steps, computed generically as
   * "every required field of the step has a value". `purpose` has NO fields,
   * so it satisfied that vacuously, and a holder who had entered nothing was
   * told "1 av 6 ifyllda" -- a statement that they had supplied one answer.
   *
   * The count now ranges over the four data-bearing steps only. An empty
   * profile reads ZERO. */
  ck("an empty profile has answered nothing at all", answeredDataCount(readerFor({})) === 0);
  ck("and has not declared", !isDeclared(readerFor({})));

  ck("a fully answered profile counts four of four", answeredDataCount(readerFor(FULL)) === 4);
  ck("and has declared", isDeclared(readerFor(FULL)));

  // The count may never reach the total number of steps: if it does,
  // something uncountable has been counted again.
  ck(
    "the count's denominator is four, not the six canonical steps",
    DATA_BEARING_COUNT === 4 && PROFILE_BASICS_COUNT === 6,
  );

  const partial = { ...FULL };
  delete partial["profession.profession"];
  ck("dropping one data answer counts three of four", answeredDataCount(readerFor(partial)) === 3);

  // The declaration is an act, not a fraction. Withdrawing it must not move
  // the count of fields the holder filled in.
  const undeclared = { ...FULL };
  delete undeclared["declaration.declared"];
  ck(
    "the declaration is not part of the field count",
    answeredDataCount(readerFor(undeclared)) === 4 && !isDeclared(readerFor(undeclared)),
  );

  // Optional fields must not hold a step hostage: a holder who gives a name
  // but no headline has answered the identity question.
  ck(
    "an optional field left empty still counts the step as answered",
    isStepAnswered(
      PROFILE_BASICS_STEPS.find((s) => s.id === "identity")!,
      readerFor({ "identity.displayName": "Elin Nordqvist" }),
    ),
  );
  // An unconfirmed legacy 'SE' is not an answer anybody gave. The route passes
  // "" for it, and the count has to treat that as unanswered.
  ck(
    "an unstated work country counts as unanswered",
    !isStepAnswered(
      PROFILE_BASICS_STEPS.find((s) => s.id === "jurisdiction")!,
      readerFor({ "jurisdiction.jurisdiction": "" }),
    ),
  );

  /* ── AND WHAT THE HOLDER ACTUALLY READS ──────────────────────────── */
  const empty = card({ answers: {}, displayAnswers: {}, declaredAccurateAt: null });

  ck("an empty profile is told it has filled in none of four", empty.includes("0 av 4"));
  // The exact sentence the Product Owner rejected. Note that "Steg 1 av 6" is
  // CORRECT and must survive -- the six-step model is still stated. What may
  // never appear is a COUNT OF ANSWERS out of six, in either language.
  ck('it never says "1 av 6 ifyllda"', !/\d+\s*av\s*6\s*(uppgifter\s*)?ifyllda/.test(empty));
  ck(
    "and never counts answers out of six in English either",
    !/\d+\s*of\s*6\s*(fields\s*)?completed/.test(
      html(
        <ProfileBasicsCard
          answers={{}}
          declaredAccurateAt={null}
          onSave={noopSave}
          onEditWorkCountry={noop}
          onEditCurrentRole={noop}
        />,
      ),
    ),
  );
  // The denominator the holder reads is the data-bearing count.
  ck(
    "the count it does render is out of four",
    new RegExp(`0 av ${DATA_BEARING_COUNT} ${passportT("basics.filled", "sv")}`).test(empty),
  );

  ck(
    "the informational step is labelled as something to read, not as filled in",
    empty.includes(passportT("basics.readThrough", "sv")),
  );
  // Four data steps missing + the declaration not given. If the information
  // page were still being counted, one of these would be an "Ifylld" instead.
  ck(
    "all four data steps are marked missing",
    (empty.match(new RegExp(passportT("basics.missing", "sv"), "g")) ?? []).length === 4,
  );
  ck(
    "an empty profile is shown as not declared",
    empty.includes(passportT("basics.notDeclared", "sv")),
  );
  ck(
    "nothing on an empty profile is marked as filled in",
    !empty.includes(`>${passportT("basics.answered", "sv")}<`),
  );

  // The canonical six-step model is still stated, and stated on every step.
  ck(
    "the six-step model is stated on every step",
    (empty.match(/av 6/g) ?? []).length === PROFILE_BASICS_COUNT,
  );
  ck(
    "and the lead explains the six as one read, four filled in, and a declaration",
    empty.includes(passportT("basics.lead", "sv")) &&
      /sex steg/.test(passportT("basics.lead", "sv")),
  );

  // A holder who HAS declared reads that, in both places.
  const declaredMarkup = card();
  ck(
    "a declared profile reads four of four and declared",
    declaredMarkup.includes("4 av 4") &&
      declaredMarkup.includes(passportT("basics.declaredOn", "sv")) &&
      !declaredMarkup.includes(passportT("basics.notDeclared", "sv")),
  );

  // Career Card's vocabulary. A Trust surface renders nothing a reader could
  // mistake for a measurement of the person.
  ck("the count is not a progress bar", !/role="progressbar"|<progress/.test(empty));
  ck("and carries no percentage", !/%\s*(<|ifyllda)/.test(empty));
}

/* ══════════════════════════════════════════════════════════════════════
   4. AN UNANSWERED PROFILE CAN BE COMPLETED, AND ANSWERS CHANGED LATER
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nEDITING -- every one of the six has a way to be changed");
{
  const empty = card({ answers: {}, displayAnswers: {}, declaredAccurateAt: null });

  ck("there is a name field to fill in", empty.includes('id="sp-basics-identity-displayName"'));
  ck("there is a headline field", empty.includes('id="sp-basics-identity-headline"'));
  // NO profession select. It used to be here, and it was the third writer
  // for a fact that already had a canonical home on /my-career: correcting
  // your profession in "Mina uppgifter" left the career profile stating the
  // old answer, with nothing to say which the product believed. The question
  // is still SHOWN -- delegated, like the work country and the current role
  // -- and edited where it is owned.
  ck(
    "there is NO profession select -- the canonical editor owns it",
    !empty.includes('id="sp-basics-profession-profession"'),
  );
  ck("there is a declaration checkbox", empty.includes('id="sp-basics-declaration-declared"'));
  ck("and a save action", empty.includes(passportT("basics.save", "sv")));

  // The two delegated questions are not editable HERE on purpose -- they have
  // canonical editors on the same page that write real rows. What the guard
  // insists on is that the holder is told where to go, not that a second
  // writer exists.
  const delegated = PROFILE_BASICS_STEPS.filter((s) => BASICS_EDIT_MODE[s.id] === "delegated");
  ck("exactly three questions are delegated", delegated.length === 3);
  ck(
    "they are the profession, the work country and the current role -- the three the Passport does not own",
    delegated.map((s) => s.id).join(",") === "profession,jurisdiction,currentRole",
  );
  /* ── EACH DELEGATED ANSWER NAMES ITSELF AND LINKS TO ITS EDITOR ─────
   *
   * The label used to read "Ändra längre ned på sidan" for both, which told
   * the holder where the control was rather than what it changed -- and made
   * the two indistinguishable. Each now names its own answer and carries a
   * real in-page anchor to the control that owns it. */
  ck(
    "the work country action names the work country",
    empty.includes(passportT("basics.editWorkCountry", "sv")),
  );
  ck(
    "the current role action names the current role",
    empty.includes(passportT("basics.editCurrentRole", "sv")),
  );
  ck(
    "the profession action names the career profile",
    empty.includes(passportT("basics.editProfession", "sv")),
  );
  ck(
    "each delegated step declares a target",
    Object.keys(BASICS_DELEGATED_ACTIONS).sort().join(",") ===
      "currentRole,jurisdiction,profession",
  );
  // A real anchor or a real link, not a bare button: it has a target a screen
  // reader can announce and it works with no JavaScript. The profession's
  // canonical editor is on another route, so its destination is a path rather
  // than a fragment -- the guard checks each for what it actually is, because
  // a check that only understood fragments is what would let a route
  // delegation ship pointing at "#undefined".
  for (const [stepId, action] of Object.entries(BASICS_DELEGATED_ACTIONS)) {
    if (action.kind === "anchor") {
      ck(
        `the ${stepId} action is an anchor to #${action.anchorId}`,
        new RegExp(`<a[^>]*href="#${action.anchorId}"`).test(empty),
      );
    } else {
      ck(
        `the ${stepId} action links to ${action.to}`,
        new RegExp(`<a[^>]*href="${action.to}"`).test(empty),
      );
    }
  }
  // The consolidation, stated where a holder reads it: this page shows the
  // profession, does not own it, and does not make it verified.
  ck(
    "the card says where the profession is actually edited",
    empty.includes(passportT("basics.editedInCareerProfile", "sv")),
  );
  // A second employer field on this card is the regression, not the fix.
  ck(
    "the card holds no employer input of its own",
    !empty.includes('id="sp-basics-currentRole-employer"'),
  );
  ck(
    "and no country select of its own",
    !empty.includes('id="sp-basics-jurisdiction-jurisdiction"'),
  );

  // A declaration is an act, not a tick box that can be untucked. The database
  // refuses a completed profile with no declaration, so an "un-declare"
  // control could only exist by weakening that constraint.
  const declared = card();
  ck(
    "a holder who has declared is offered a re-affirmation, not an empty box",
    declared.includes(passportT("basics.declareAgain", "sv")) &&
      !declared.includes('id="sp-basics-declaration-declared"'),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5. SELF-REPORTED IS NEVER MISTAKEN FOR VERIFIED
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nTRUST -- what the holder said, labelled as what the holder said");
{
  const markup = card();
  ck(
    "the card states that this is self-reported and unchecked",
    markup.includes(passportT("basics.selfReported", "sv")),
  );
  // The sentence has to do the work, so it is pinned in both languages rather
  // than merely being present.
  for (const lang of ["sv", "en"] as const) {
    const text = passportT("basics.selfReported", lang);
    ck(
      `the ${lang} wording says saving does not make it verified`,
      /verifierade|verified/.test(text),
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   6. THE WRITE PATH CANNOT REACH ANYTHING IT MUST NOT
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nWRITES -- what savePassportBasics is structurally unable to do");
{
  const src = read("src/lib/security-passport/passport.functions.ts");
  const start = src.indexOf("export const savePassportBasics");
  ck("the server function exists", start !== -1);
  const body = src.slice(start, src.indexOf("const experienceInput", start));

  // Editing a self-reported field must not touch a credential, an employment
  // record or a verification state.
  for (const forbidden of [
    "sp_claims",
    "sp_experience_periods",
    "assertion_level",
    "lifecycle_state",
    "verified_by_user_id",
    "verified_at",
  ]) {
    ck(`it never mentions ${forbidden}`, !body.includes(forbidden));
  }

  // The whole reason it is not `saveOnboardingProgress`: a permanent editor
  // that wrote these would knock a holder who FINISHED onboarding back into
  // the middle of it because they fixed a typo.
  ck("it never writes onboarding_state", !body.includes("onboarding_state"));
  ck("it never writes onboarding_step", !body.includes("onboarding_step"));

  // One holder, scoped by their own id, on an RLS-scoped client.
  ck("every write is scoped by holder_user_id", body.includes('.eq("holder_user_id", userId)'));
  ck("it takes the caller's session", body.includes("requireSupabaseAuth"));
  ck(
    "and never a service-role client",
    !body.includes("service_role") && !body.includes("SERVICE_ROLE"),
  );

  // Affirm-only, enforced by the validator rather than by the UI.
  ck(
    "the declaration input accepts only true",
    src.includes("declared: z.literal(true).optional()"),
  );

  // The two doors on one fact must not disagree.
  ck("the wizard's answers are merged, not replaced", body.includes("...previous"));
}

/* ══════════════════════════════════════════════════════════════════════
   7. RLS STILL SCOPES THE ROW TO ITS OWNER
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nOWNERSHIP -- one candidate cannot read or edit another's answers");
{
  const mig = read("supabase/migrations/20260817090000_sp_phase2_live_foundation.sql");
  ck(
    "row level security is on the profile table",
    mig.includes("ALTER TABLE public.sp_passport_profiles  ENABLE ROW LEVEL SECURITY"),
  );
  ck(
    "select is scoped to the holder",
    /sp_profiles_self_select[\s\S]{0,200}holder_user_id = auth\.uid\(\)/.test(mig),
  );
  ck(
    "update is scoped to the holder, both ways",
    /sp_profiles_self_update[\s\S]{0,300}USING \(holder_user_id = auth\.uid\(\)\)[\s\S]{0,120}WITH CHECK \(holder_user_id = auth\.uid\(\)/.test(
      mig,
    ),
  );
  ck(
    "and anon holds nothing",
    mig.includes("REVOKE ALL ON public.sp_passport_profiles    FROM anon"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   8. THE EDITOR IS ON THE PAGE, PERMANENTLY
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nPLACEMENT -- Mitt Security Passport > Mina uppgifter");
{
  const route = read("src/routes/_authenticated.passport.information.tsx");
  ck("the information page renders the basics card", route.includes("<ProfileBasicsCard"));
  // Unconditional. The defect was an editor that existed only while the
  // Passport was incomplete, so a render behind `onboardingState` or
  // `isEmpty` would rebuild it.
  ck(
    "and renders it unconditionally, not only while onboarding is unfinished",
    /<ProfileBasicsCard/.test(route) &&
      !/\{\s*\w*[Oo]nboarding\w*\s*(&&|\?)[\s\S]{0,80}<ProfileBasicsCard/.test(route),
  );
  ck(
    "the delegated targets exist to be reached",
    route.includes('id="sp-employment"') &&
      read("src/components/security-passport/WorkCountryCard.tsx").includes('id="sp-work-country"'),
  );
  ck(
    "the page names the second area for work country and authorisations",
    route.includes('pt("basics.qualificationsTitle")'),
  );

  // Nothing about the Passport navigation may quietly change here: this is a
  // Passport bugfix, and the tabs are a separate, reviewed decision.
  const shell = read("src/routes/_authenticated.passport.tsx");
  ck(
    "the Passport navigation still has its four tabs",
    (shell.match(/\{ to: "\/passport/g) ?? []).length === 4,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   9. SWEDISH AND ENGLISH BOTH SAY SOMETHING
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nLANGUAGE -- both, and different from each other");
{
  const keys: readonly PassportCopyKey[] = [
    "basics.title",
    "basics.lead",
    "basics.filled",
    "basics.question",
    "basics.answered",
    "basics.missing",
    "basics.noAnswerNeeded",
    "basics.selfReported",
    "basics.save",
    "basics.savedNotice",
    "basics.readThrough",
    "basics.notDeclared",
    "basics.editWorkCountry",
    "basics.editCurrentRole",
    "basics.editProfession",
    "basics.editedBelow",
    "basics.editedInCareerProfile",
    "basics.declaredOn",
    "basics.declareAgain",
    "basics.declarationNote",
    "basics.qualificationsTitle",
    "basics.qualificationsLead",
  ];
  for (const key of keys) {
    const sv = passportT(key, "sv");
    const en = passportT(key, "en");
    ck(`${key} is authored in both languages`, sv.trim() !== "" && en.trim() !== "");
  }
  // The six question titles come from the wizard's own copy, so a holder is
  // never asked one thing in onboarding and a subtly different thing here.
  for (const step of PROFILE_BASICS_STEPS) {
    ck(`question "${step.id}" reads in English too`, passportT(step.titleKey, "en").trim() !== "");
  }
}

console.log(
  `\n${fails.length === 0 ? "PASS" : `FAIL (${fails.length})`} — passport-profile-basics-check`,
);
for (const f of fails) console.log(`  - ${f}`);
if (fails.length > 0) process.exit(1);
