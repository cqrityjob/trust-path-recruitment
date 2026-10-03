// Career analysis: every surface, in every state, in both languages.
//
// The behaviour of the rule itself (the resolver, the server's save gate, the
// SQL table) is scripts/career-analysis-availability-check.ts. THIS renders
// the REAL components that offer, withdraw or explain the analysis and reads
// the markup, so "withdrawn when closed" is a property of what a reader is
// shown, not of a regex over source.
//
// ── THE MATRIX ─────────────────────────────────────────────────────────
//
// For each state of the release control (internal_test / public / paused) and
// each actor (anonymous, a signed-in account outside the test group, an
// internal tester, a platform admin), the one resolver yields the answer the
// hook gives every surface — true (offer), false (withdraw), undefined (not
// answered yet, keep). That answer is fed to the hook's seat, each surface is
// rendered, and the link into /security-career-assessment must be there
// exactly when the answer is not a definite "closed" (and for the retake link,
// exactly when it is a definite "open").
//
// The closed state's own panel is rendered for all three reasons, in both
// languages, with each way a finished run can be held, and must say what it
// says, offer the ways on, and offer no retry.
//
// What needs a browser (clicking through, the real server-function boundary,
// phone width) is e2e/career-analysis-availability.spec.ts.
//
// Run: bun run career-analysis-surfaces:check

import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const actualRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  Link: ({
    to,
    params,
    search,
    hash,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    if (search && typeof search === "object") {
      const qs = new URLSearchParams(
        Object.entries(search as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      ).toString();
      if (qs) href += `?${qs}`;
    }
    if (hash) href += `#${String(hash)}`;
    const { activeProps: _a, inactiveProps: _i, resetScroll: _r, replace: _p, ...dom } = rest;
    return React.createElement("a", { href, ...dom }, children);
  },
  useRouter: () => ({ history: { push: () => undefined } }),
}));

// The ONE hook every surface reads, as a switch. Its source is asserted in the
// availability check; here its three answers are what each surface is shown.
let hookAnswer: boolean | undefined = undefined;
await mock.module("@/components/career-discovery/use-career-analysis-open", () => ({
  useCareerAnalysisOpen: () => hookAnswer,
}));
await mock.module("@/hooks/useSignedIn", () => ({ useSignedIn: () => false }));
// A profession guide reads the session flag only to choose its Passport entry
// point; it is a constant here, the rest of the module is the real one.
const actualDirection = await import("../src/hooks/useMyCareerDirection");
await mock.module("@/hooks/useMyCareerDirection", () => ({
  ...actualDirection,
  useSupabaseSessionFlag: () => false,
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const cc = await import("../src/lib/career-center");
const { analysisOpenFlag, resolveAnalysisAccess } =
  await import("../src/lib/career-discovery/analysis-access");
const { CareerEntryCards } = await import("../src/components/career-center/CareerEntryCards");
const { PathFromSection } = await import("../src/components/career-center/PathFromSection");
const { PersonalDirectionSection } =
  await import("../src/components/career-center/PersonalDirection");
const { ProfessionTemplate } = await import("../src/components/career-center/ProfessionTemplate");
const { AssessmentInvite } = await import("../src/components/jobs/AssessmentInvite");
const { RetakeAnalysisLink } =
  await import("../src/components/career-discovery/RetakeAnalysisLink");
const { ClosedAnalysisPanel } =
  await import("../src/components/career-discovery/v31/ClosedAnalysisPanel");

const fails: string[] = [];
let checks = 0;
function ck(name: string, ok: boolean, detail?: string): void {
  checks += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

type Lang = "sv" | "en";
const LANGS: readonly Lang[] = ["sv", "en"];
const dict = dictionaries as unknown as Record<Lang, Record<string, string>>;
function render(node: React.ReactNode, lang: Lang): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLang={lang}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}
const ENTRANCE_HREF = 'href="/security-career-assessment"';
const noop = () => undefined;

// What the hook would answer each reader, from the resolver and the database
// table the other guard holds to the SQL suite.
type State = "internal_test" | "public" | "paused";
type Actor = "anonymous" | "plain" | "tester" | "admin";
const MAY_START: Record<State, Record<Exclude<Actor, "anonymous">, boolean>> = {
  internal_test: { plain: false, tester: true, admin: true },
  public: { plain: true, tester: true, admin: true },
  paused: { plain: false, tester: false, admin: true },
};
function answerFor(state: State, actor: Actor): boolean | undefined {
  const signedIn = actor !== "anonymous";
  return analysisOpenFlag(
    resolveAnalysisAccess({
      availability: { available: state !== "paused", accessState: state },
      signedIn,
      mayStart: signedIn ? MAY_START[state][actor as Exclude<Actor, "anonymous">] : null,
    }),
  );
}

const guideProfession = cc.getPublishedProfession("security-officer")!;
const freeText = cc.careerOrigin({ profileLabel: "Brandvakt" });
const anonymous = cc.personalDirection(undefined, { signedIn: false });
const noResult = cc.personalDirection({ state: "none" }, { signedIn: true });

// =========================================================================
group(
  "1 · Every surface, every state x actor (the link is there exactly when the door is not closed)",
);
// =========================================================================
for (const state of ["internal_test", "public", "paused"] as const) {
  for (const actor of ["anonymous", "plain", "tester", "admin"] as const) {
    hookAnswer = answerFor(state, actor);
    const open = hookAnswer;
    const label = `${state} / ${actor} (hook says ${String(open)})`;
    const keeps = open !== false;
    for (const lang of LANGS) {
      const entry = render(
        <CareerEntryCards
          pathAnchor="a"
          personalAnchor="b"
          listAnchor="c"
          signedIn={actor !== "anonymous"}
        />,
        lang,
      );
      ck(
        `1.1 [${lang}] ${label}: the career centre's second entry card ${keeps ? "offers" : "withdraws"} the analysis`,
        entry.includes('data-cta="career-entry-assessment"') === keeps &&
          entry.includes('data-cta="career-entry-explore"'),
      );

      const path = render(
        <PathFromSection
          origin={freeText}
          profileStatus="ready"
          onSelect={noop}
          onClear={noop}
          onReset={noop}
          listAnchor="utforska-yrken"
        />,
        lang,
      );
      ck(
        `1.2 [${lang}] ${label}: the 'from my profession' card ${keeps ? "offers" : "withdraws"} the analysis and always keeps the way on`,
        path.includes(ENTRANCE_HREF) === keeps && path.includes('href="#utforska-yrken"'),
      );

      for (const [name, direction] of [
        ["anonymous", anonymous],
        ["no result", noResult],
      ] as const) {
        const personal = render(
          <PersonalDirectionSection direction={direction} listAnchor="utforska-yrken" />,
          lang,
        );
        ck(
          `1.3 [${lang}] ${label}: the personal section (${name}) ${keeps ? "offers" : "withdraws"} the analysis${keeps ? "" : " and says so"}`,
          personal.includes(ENTRANCE_HREF) === keeps &&
            personal.includes(dict[lang]["home.career.closed"]) === !keeps &&
            personal.includes("data-explore-catalogue"),
        );
      }

      const guide = render(<ProfessionTemplate profession={guideProfession} />, lang);
      ck(
        `1.7 [${lang}] ${label}: the profession guide's analysis card ${keeps ? "offers" : "is replaced by the closed sentence"}`,
        guide.includes(ENTRANCE_HREF) === keeps &&
          guide.includes("data-career-analysis-closed") === !keeps &&
          (keeps || guide.includes(dict[lang]["home.career.closed"])),
      );

      const invite = render(<AssessmentInvite />, lang);
      ck(
        `1.4 [${lang}] ${label}: the jobs invitation ${keeps ? "is shown" : "renders nothing"}`,
        invite.includes(ENTRANCE_HREF) === keeps,
      );

      const retake = render(<RetakeAnalysisLink />, lang);
      ck(
        `1.5 [${lang}] ${label}: the retake link appears only when the door is definitely open`,
        retake.includes("data-retake-analysis") === (open === true) &&
          retake.includes(ENTRANCE_HREF) === (open === true),
      );
    }
  }
}
// The same switch, answering "not yet": nothing is withdrawn (the route asks
// again and says the truth), except the retake link, which waits for a yes.
hookAnswer = undefined;
for (const lang of LANGS) {
  ck(
    `1.6 [${lang}] while the answer is not known, every offer stands and the retake link waits`,
    render(<CareerEntryCards pathAnchor="a" personalAnchor="b" listAnchor="c" />, lang).includes(
      'data-cta="career-entry-assessment"',
    ) &&
      render(<AssessmentInvite />, lang).includes(ENTRANCE_HREF) &&
      !render(<RetakeAnalysisLink />, lang).includes("data-retake-analysis"),
  );
}

// =========================================================================
group("2 · The closed panel: three true sentences, where the run is kept, no retry");
// =========================================================================
const KEEP_CLAIM = { kind: "claim", expiresAt: "2026-10-10T12:00:00.000Z" } as const;
const KEEP_TAB = { kind: "tab" } as const;
for (const lang of LANGS) {
  const d = dict[lang];
  for (const [reason, title, body] of [
    ["paused", d["cd.public.paused.title"], d["cd.public.paused.body"]],
    ["account", d["cd.public.account.title"], d["cd.public.account.body"]],
    ["unavailable", d["cd.public.unavailableTitle"], d["cd.public.unavailableBody"]],
  ] as const) {
    for (const signedIn of [false, true]) {
      const html = render(
        <ClosedAnalysisPanel reason={reason} signedIn={signedIn} keep={null} />,
        lang,
      );
      const tag = `[${lang}] ${reason} / ${signedIn ? "signed in" : "signed out"}`;
      ck(`2.1 ${tag}: says its own title and body`, html.includes(title) && html.includes(body));
      ck(
        `2.2 ${tag}: the other reasons' sentences are not said`,
        [d["cd.public.paused.title"], d["cd.public.account.title"], d["cd.public.unavailableTitle"]]
          .filter((t) => t !== title)
          .every((t) => !html.includes(t)),
      );
      ck(
        `2.3 ${tag}: offers no retry and no entrance link`,
        !html.includes("<button") && !html.includes(ENTRANCE_HREF),
      );
      ck(`2.4 ${tag}: always names the career centre`, html.includes('href="/career-center"'));
      ck(
        `2.5 ${tag}: the Passport, in the right place for the reader`,
        signedIn
          ? html.includes('href="/passport"') &&
              html.includes('href="/my-career"') &&
              !html.includes('href="/security-passport"')
          : html.includes('href="/security-passport"') &&
              !html.includes('href="/passport"') &&
              !html.includes('href="/my-career"'),
      );
    }
  }
  const claim = render(<ClosedAnalysisPanel reason="paused" signedIn keep={KEEP_CLAIM} />, lang);
  ck(
    `2.6 [${lang}] a staged claim says it is kept, until a date, and what to do`,
    claim.includes('data-keep="claim"') && claim.includes("2026") && !claim.includes("{date}"),
  );
  const tab = render(
    <ClosedAnalysisPanel reason="paused" signedIn={false} keep={KEEP_TAB} />,
    lang,
  );
  ck(
    `2.7 [${lang}] answers held only in the tab say so`,
    tab.includes('data-keep="tab"') && tab.includes(dict[lang]["cd.public.keep.tab"]),
  );
  const none = render(<ClosedAnalysisPanel reason="account" signedIn keep={null} />, lang);
  ck(
    `2.8 [${lang}] with nothing to keep, nothing is claimed about kept answers`,
    !none.includes("data-keep"),
  );
}

console.log("");
if (fails.length > 0) {
  console.error(`career-analysis-surfaces-check FAILED (${fails.length} of ${checks}).`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`career-analysis-surfaces-check: ${checks} assertions passed.`);
