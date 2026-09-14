/**
 * Negative controls for the owner's two-column Overview.
 *
 * The correction consolidated a Passport presence that had spread across
 * three places on this page — a wide statistics panel beside the
 * recommendation, a full-width "here is your Passport" preview below it,
 * and a second add-a-merit link — into ONE right-hand column: the card,
 * what it contains, and one way in.
 *
 * Two failure modes matter and both are planted here: the duplication
 * coming back (a second card, a second summary, the add-a-merit
 * destination), and the mobile reading order reversing so that a phone
 * shows the Passport before the career area the owner put first.
 *
 * Each mutation changes exactly one thing, the guard must fail with the
 * named diagnostic, and every file is restored byte-for-byte (proved by
 * the shared runner).
 *
 * Run: bun run negative-controls:overview-composition
 */
import { runControls, type Mutation } from "./runner";

const ROUTE = "src/routes/_authenticated.my-career.index.tsx";
const SUMMARY = "src/components/professional-identity/PassportSummary.tsx";
const DASH = "my-career-dashboard:check";
const PREMIUM = "my-career-premium-overview:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The duplication comes back -----------------------------------------
  {
    id: "OV-NC-CARD-DUPLICATED",
    defect:
      "a second Passport card appears on Overview, which is the full-width duplicate preview the owner removed",
    file: ROUTE,
    find: "          <OverviewPassportCard lang={lang as Lang} />",
    replace:
      "          <OverviewPassportCard lang={lang as Lang} />\n          <OverviewPassportCard lang={lang as Lang} />",
    guard: DASH,
    expect: "exactly one Passport card and one Passport summary",
  },
  {
    id: "OV-NC-ADD-MERIT-RETURNS",
    defect:
      "Overview regrows its own add-a-merit destination, so the Passport page is no longer the one place a merit is added",
    file: ROUTE,
    find: "          <OverviewPassportCard lang={lang as Lang} />",
    replace:
      '          <OverviewPassportCard lang={lang as Lang} />\n          <Link to="/passport/credentials/new">add</Link>',
    guard: DASH,
    expect: "must not carry its own add-a-merit destination",
  },
  {
    id: "OV-NC-SECOND-ACTION-IN-SUMMARY",
    defect:
      "the Passport summary regrows a second action beside the canonical one, which is how the column stops having one way in",
    file: SUMMARY,
    find: '          <Link to="/passport" className={LINK} data-cta="overview-open-passport">',
    replace:
      '          <Link to="/passport/credentials/new" className={LINK}>add</Link>\n          <Link to="/passport" className={LINK} data-cta="overview-open-passport">',
    guard: DASH,
    expect: "must not carry its own add-a-merit destination",
  },

  // ---- The mobile reading order reverses ----------------------------------
  {
    id: "OV-NC-MOBILE-ORDER-REVERSED",
    defect:
      "the Passport area is placed before the career area, so a phone shows the Passport first — the reverse of the order the owner specified",
    file: ROUTE,
    find: "          <CareerPageHeader profile={model.profile} onRetry={retryIdentity} />",
    replace:
      "          <OverviewPassportCard lang={lang as Lang} />\n          <CareerPageHeader profile={model.profile} onRetry={retryIdentity} />",
    guard: DASH,
    expect: "the whole career area must precede the whole Passport area",
  },
  {
    id: "OV-NC-CSS-REORDER",
    defect:
      "a CSS reorder is introduced, so what a screen reader hears and what a phone shows stop agreeing",
    file: ROUTE,
    find: '<div className="min-w-0 lg:col-span-8">',
    replace: '<div className="min-w-0 lg:order-2 lg:col-span-8">',
    guard: DASH,
    expect: "no CSS reordering",
  },

  // ---- The contents preview is replaced by counts alone --------------------
  {
    id: "OV-NC-CONTENTS-REPLACED-BY-COUNTS",
    defect:
      "the Passport column stops showing what the Passport CONTAINS and offers only status totals, which describe its state and never its contents",
    file: ROUTE,
    find: '          <OverviewPassportContents lang={lang as Lang} className="mt-5" />',
    replace: "",
    guard: DASH,
    expect: "must show what the Passport contains",
  },
  {
    id: "OV-NC-CONTENTS-BEFORE-CARD",
    defect:
      "the contents preview is moved above the card, so the column no longer reads card-then-contents",
    file: ROUTE,
    find: "          <OverviewPassportCard lang={lang as Lang} />\n\n          {/* WHAT IS IN IT",
    replace:
      "          <OverviewPassportContents lang={lang as Lang} />\n          <OverviewPassportCard lang={lang as Lang} />\n\n          {/* WHAT IS IN IT",
    guard: DASH,
    expect: "card, then contents, then the totals",
  },

  // ---- The column split loses its meaning ----------------------------------
  {
    id: "OV-NC-COLUMNS-SWAPPED",
    defect:
      "the Passport becomes the wider column and the career area the narrower one, inverting the split the owner specified",
    file: ROUTE,
    find: '<div className="min-w-0 lg:col-span-8">',
    replace: '<div className="min-w-0 lg:col-span-4">',
    guard: PREMIUM,
    expect: "the career column is the wider one",
  },
  {
    id: "OV-NC-REGION-UNLABELLED",
    defect:
      "the Passport column stops being one labelled region, which is how its parts drift back across the page",
    file: ROUTE,
    find: "          data-overview-passport-region",
    replace: "          data-overview-passport-scattered",
    guard: PREMIUM,
    expect: "one labelled region",
  },
];

runControls("overview-composition", MUTATIONS);
