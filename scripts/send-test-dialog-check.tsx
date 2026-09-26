// "Skicka test" — the one send dialog, both levels, asserted against the
// RENDERED markup in both languages and against the sources that mount it.
//
// Owner bug report (2026-09-26): no way to send a test from the recruitment
// overview. Owner update: both assessment levels available at launch, the
// strategic one never hidden, never "coming soon", and never the operational
// test renamed. Since 20261216090000 the strategic level has content of its
// own, authored as a governed draft: the dialog says "draft awaiting content
// approval" while the library refuses it, offers it once released, and says
// "not installed" where the library does not carry it at all.
//
// Run: bun run send-test-dialog:check

import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  ASSESSMENT_LEVELS,
  STRATEGIC_CONTENT_PARTS,
  resolveLevelOffers,
  type OfferableAssessment,
} from "../src/lib/library/levels";
import { TRUST_CONTENT } from "../src/lib/library/catalogue";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");

const failures: string[] = [];
/** What renderToStaticMarkup does to text: the check compares escaped copy. */
const esc = (t: string): string =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
let n = 0;
function ck(label: string, ok: boolean): void {
  n += 1;
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

/* ── 1 · the pure resolver ─────────────────────────────────────────── */
console.log("\n1 · the level resolver");
const VAKTARE: OfferableAssessment = {
  libraryKind: "assessment",
  slug: "security-officer-recruitment",
  itemId: "11111111-1111-4111-8111-111111111111",
  nameSv: "Väktare – Recruitment Assessment",
  nameEn: "Security Officer – Recruitment Assessment",
  designedFor: "recruitment_support",
  assignable: true,
  unassignableReason: null,
  contentStatus: "draft",
  validationStatus: "design",
  itemCount: 50,
  moduleCount: 5,
  minutesMin: 35,
  minutesMax: 50,
  competenciesSv: [],
  competenciesEn: [],
};
/** The strategic test as the library reports it BEFORE the content approval:
 *  present, a draft, refused as not permitted. */
const SM_DRAFT: OfferableAssessment = {
  ...VAKTARE,
  slug: "security-manager-recruitment",
  itemId: "44444444-4444-4444-8444-444444444444",
  nameSv: "Säkerhetschef – Recruitment Assessment",
  nameEn: "Security Manager – Recruitment Assessment",
  assignable: false,
  unassignableReason: "not_permitted",
  itemCount: 37,
  moduleCount: 5,
  minutesMin: 35,
  minutesMax: 50,
};
/** ...and AFTER it (designated, or under a closed-test grant). */
const SM_RELEASED: OfferableAssessment = {
  ...SM_DRAFT,
  assignable: true,
  unassignableReason: null,
};
ck(
  "two levels, operational first, strategic second, neither hidden",
  ASSESSMENT_LEVELS.length === 2 &&
    ASSESSMENT_LEVELS[0]!.group === "operational" &&
    ASSESSMENT_LEVELS[1]!.group === "strategic",
);
ck(
  "the operational level maps to the catalogue's security-officer test",
  ASSESSMENT_LEVELS[0]!.assessmentSlug === TRUST_CONTENT.vaktare?.assessmentSlug &&
    ASSESSMENT_LEVELS[0]!.assessmentSlug === "security-officer-recruitment",
);
ck(
  "the strategic level maps to its OWN test, never the operational one",
  ASSESSMENT_LEVELS[1]!.assessmentSlug === "security-manager-recruitment" &&
    TRUST_CONTENT.security_manager?.assessmentSlug === "security-manager-recruitment" &&
    TRUST_CONTENT.security_manager?.guidePackSlug === "security-manager-se" &&
    ASSESSMENT_LEVELS[1]!.assessmentSlug !== ASSESSMENT_LEVELS[0]!.assessmentSlug,
);
const offers = resolveLevelOffers([VAKTARE], new Set());
ck(
  "operational: sendable with its test",
  offers[0]!.state === "sendable" && offers[0]!.assessment?.slug === VAKTARE.slug,
);
ck(
  "strategic, library without its test: no_content, with the five parts the level consists of",
  offers[1]!.state === "no_content" &&
    offers[1]!.assessment === null &&
    !offers[1]!.draftAwaitingRelease &&
    offers[1]!.parts.length === 5 &&
    offers[1]!.parts.every((m) => STRATEGIC_CONTENT_PARTS.includes(m)),
);
const pending = resolveLevelOffers([VAKTARE, SM_DRAFT], new Set());
ck(
  "strategic, draft refused as not permitted: not_assignable AND draft awaiting release",
  pending[1]!.state === "not_assignable" &&
    pending[1]!.draftAwaitingRelease &&
    pending[1]!.assessment?.slug === SM_DRAFT.slug &&
    pending[0]!.state === "sendable",
);
ck(
  "a refusal that is NOT about a draft (retired, no items) is not called awaiting release",
  !resolveLevelOffers([VAKTARE, { ...SM_DRAFT, unassignableReason: "no_items" }], new Set())[1]!
    .draftAwaitingRelease &&
    !resolveLevelOffers([VAKTARE, { ...SM_DRAFT, contentStatus: "published" }], new Set())[1]!
      .draftAwaitingRelease,
);
ck(
  "strategic, released: sendable with its own test",
  resolveLevelOffers([VAKTARE, SM_RELEASED], new Set())[1]!.state === "sendable" &&
    resolveLevelOffers([VAKTARE, SM_RELEASED], new Set())[1]!.assessment?.slug === SM_DRAFT.slug,
);
ck(
  "strategic is never the operational test renamed, whatever the library carries",
  resolveLevelOffers([VAKTARE, { ...VAKTARE, slug: "anything-else" }], new Set())[1]!.assessment ===
    null &&
    resolveLevelOffers([VAKTARE, SM_RELEASED], new Set())[1]!.assessment?.slug !== VAKTARE.slug,
);
ck(
  "strategic already sent on this application: already_sent",
  resolveLevelOffers([VAKTARE, SM_RELEASED], new Set([SM_DRAFT.slug]))[1]!.state === "already_sent",
);
ck(
  "already sent on this application: already_sent, not sendable",
  resolveLevelOffers([VAKTARE], new Set([VAKTARE.slug]))[0]!.state === "already_sent",
);
ck(
  "a test the organisation may not run: not_assignable",
  resolveLevelOffers([{ ...VAKTARE, assignable: false }], new Set())[0]!.state === "not_assignable",
);
ck(
  "a library without the test: no_content for operational too (nothing invented)",
  resolveLevelOffers([], new Set())[0]!.state === "no_content",
);
ck(
  "a training row never counts as the recruitment test",
  resolveLevelOffers([{ ...VAKTARE, libraryKind: "training" }], new Set())[0]!.state ===
    "no_content",
);
ck(
  "a competence-development assessment never counts either",
  resolveLevelOffers([{ ...VAKTARE, designedFor: "competence_development" }], new Set())[0]!
    .state === "no_content",
);

/* ── 2 · the rendered dialog, both languages ───────────────────────── */
console.log("\n2 · the rendered dialog");
const actualRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => {
  return {
    ...actualRouter,
    Link: ({
      to,
      children,
      ...rest
    }: { to: string; children: unknown } & Record<string, unknown>) => {
      const { params: _p, search: _s, ...attrs } = rest as Record<string, unknown>;
      return (
        <a href={String(to)} {...(attrs as object)}>
          {children as never}
        </a>
      );
    },
  };
});
const queries = new Map<string, unknown>();
await mock.module("@tanstack/react-query", () => {
  return {
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
      const key = JSON.stringify(queryKey);
      const data = queries.get(key);
      return { data, isLoading: false, isError: data === undefined, isSuccess: data !== undefined };
    },
    useQueryClient: () => ({ invalidateQueries: async () => undefined }),
  };
});
await mock.module("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
await mock.module("@/lib/security-competency/academy-employer.functions", () => ({
  listContentLibrary: async () => [],
  listApplicationAssessments: async () => [],
}));
await mock.module("@/lib/library/start.functions", () => ({ sendTestFromSetup: async () => null }));
await mock.module("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogContent: ({ children, ...rest }: { children: unknown } & Record<string, unknown>) => (
    <div {...(rest as object)}>{children as never}</div>
  ),
  DialogDescription: ({ children }: { children: unknown }) => <p>{children as never}</p>,
  DialogFooter: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogHeader: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogTitle: ({ children }: { children: unknown }) => <h2>{children as never}</h2>,
}));
const { SendTestDialog } = await import("../src/components/recruitment/SendTestDialog");

const EMPLOYER = "22222222-2222-4222-8222-222222222222";
const APPLICATION = "33333333-3333-4333-8333-333333333333";
function render(
  lang: "sv" | "en",
  sent: ReadonlyArray<{ assessmentSlug: string; attemptStatus: string }>,
  library: readonly OfferableAssessment[] = [VAKTARE],
) {
  queries.set(JSON.stringify(["employer", EMPLOYER, "library", "recruitment"]), library);
  queries.set(
    JSON.stringify(["employer", EMPLOYER, "application", APPLICATION, "assessments"]),
    sent,
  );
  return renderToStaticMarkup(
    <I18nProvider initialLang={lang}>
      <SendTestDialog
        employerId={EMPLOYER}
        employerSlug="acme"
        applicationId={APPLICATION}
        candidateName="Alva Berg"
        jobTitle="Väktare, Uppsala"
        onClose={() => undefined}
      />
    </I18nProvider>,
  );
}
for (const lang of ["sv", "en"] as const) {
  const d = dictionaries[lang];
  const html = render(lang, []);
  ck(
    `${lang}: the recipient and the job are stated before anything is sent`,
    html.includes("Alva Berg") &&
      html.includes("Väktare, Uppsala") &&
      html.includes(esc(d["sendTest.recipient"])),
  );
  ck(
    `${lang}: both levels are rendered, operational sendable, strategic no_content`,
    /data-testid="send-test-level-operational"[^>]*data-state="sendable"/.test(html) &&
      /data-testid="send-test-level-strategic"[^>]*data-state="no_content"/.test(html),
  );
  ck(
    `${lang}: each level says who it is for and what it produces`,
    html.includes(esc(d["sendTest.level.operational.audience"])) &&
      html.includes(esc(d["sendTest.level.operational.purpose"])) &&
      html.includes(esc(d["sendTest.level.strategic.audience"])) &&
      html.includes(esc(d["sendTest.level.strategic.purpose"])),
  );
  ck(
    `${lang}: the operational level names its test, size and time`,
    html.includes(lang === "sv" ? VAKTARE.nameSv : VAKTARE.nameEn) &&
      html.includes(
        esc(d["sendTest.test.size"].replace("{items}", "50").replace("{modules}", "5")),
      ),
  );
  const strategic = html.slice(html.indexOf('data-testid="send-test-level-strategic"'));
  ck(
    `${lang}: not installed: the strategic level says so and names the five parts`,
    /data-testid="send-test-strategic-missing"/.test(strategic) &&
      STRATEGIC_CONTENT_PARTS.every((m) => strategic.includes(esc(d[`sendTest.part.${m}`]))) &&
      strategic.includes(esc(d["sendTest.level.strategic.notInstalled"])),
  );
  ck(
    `${lang}: and never the operational test, and never "coming soon"`,
    !strategic.includes("Recruitment Assessment") &&
      !/kommer snart|coming soon|godkänt|approved test/i.test(strategic),
  );
  ck(
    `${lang}: the strategic level points at the interview support that DOES exist`,
    strategic.includes(esc(d["sendTest.level.strategic.interviewInstead"])),
  );

  // The draft, present in the library and refused: awaiting content approval.
  const pendingHtml = render(lang, [], [VAKTARE, SM_DRAFT]);
  const pendingStrategic = pendingHtml.slice(
    pendingHtml.indexOf('data-testid="send-test-level-strategic"'),
  );
  ck(
    `${lang}: draft awaiting release: not_assignable, said as awaiting content approval, with its own test named as a draft`,
    /data-testid="send-test-level-strategic"[^>]*data-state="not_assignable"/.test(pendingHtml) &&
      /data-testid="send-test-strategic-pending"/.test(pendingStrategic) &&
      pendingStrategic.includes(esc(d["sendTest.level.strategic.pendingApproval"])) &&
      /data-testid="send-test-card-strategic"[^>]*data-content-status="draft"/.test(
        pendingStrategic,
      ) &&
      pendingStrategic.includes(esc(lang === "sv" ? SM_DRAFT.nameSv : SM_DRAFT.nameEn)) &&
      pendingStrategic.includes(esc(d["sendTest.test.closedTest"])) &&
      STRATEGIC_CONTENT_PARTS.every((m) =>
        pendingStrategic.includes(esc(d[`sendTest.part.${m}`])),
      ) &&
      !pendingStrategic.includes(esc(d["sendTest.level.notAssignable"])) &&
      !pendingStrategic.includes(esc(VAKTARE.nameSv)) &&
      !pendingStrategic.includes(esc(VAKTARE.nameEn)) &&
      !/kommer snart|coming soon|validerat|validated/i.test(pendingStrategic),
  );

  // Released: sendable, with its own test and the closed-test note.
  const releasedHtml = render(lang, [], [VAKTARE, SM_RELEASED]);
  const releasedStrategic = releasedHtml.slice(
    releasedHtml.indexOf('data-testid="send-test-level-strategic"'),
  );
  ck(
    `${lang}: released: sendable with its own test, still said to be a draft run as a closed test`,
    /data-testid="send-test-level-strategic"[^>]*data-state="sendable"/.test(releasedHtml) &&
      releasedStrategic.includes(esc(lang === "sv" ? SM_DRAFT.nameSv : SM_DRAFT.nameEn)) &&
      releasedStrategic.includes(
        esc(d["sendTest.test.size"].replace("{items}", "37").replace("{modules}", "5")),
      ) &&
      releasedStrategic.includes(esc(d["sendTest.test.closedTest"])) &&
      !releasedStrategic.includes(esc(VAKTARE.nameSv)) &&
      !releasedStrategic.includes(esc(VAKTARE.nameEn)) &&
      !/data-testid="send-test-strategic-(pending|missing)"/.test(releasedStrategic),
  );
  ck(
    `${lang}: the language of the test is a choice, both languages offered`,
    html.includes(esc(d["sendTest.language.sv"])) && html.includes(esc(d["sendTest.language.en"])),
  );
  ck(
    `${lang}: no Swedish leaks into the English dialog`,
    lang === "sv" || !/Skicka test|Operativa roller|Strategiska/.test(html),
  );
  const already = render(lang, [{ assessmentSlug: VAKTARE.slug, attemptStatus: "in_progress" }]);
  ck(
    `${lang}: already sent: said, and the submit is disabled`,
    /data-state="already_sent"/.test(already) &&
      already.includes(esc(d["sendTest.level.alreadySent"])) &&
      /data-testid="send-test-submit"[^>]*disabled/.test(already),
  );
  const abandoned = render(lang, [{ assessmentSlug: VAKTARE.slug, attemptStatus: "abandoned" }]);
  ck(
    `${lang}: an abandoned attempt frees the level again`,
    /data-testid="send-test-level-operational"[^>]*data-state="sendable"/.test(abandoned),
  );
}

/* ── 3 · the entry points ──────────────────────────────────────────── */
console.log("\n3 · where 'Skicka test' is offered");
const list = code(read("src/routes/_authenticated.employer.$employerSlug.applications.index.tsx"));
const table = code(read("src/components/recruitment/CandidateTable.tsx"));
const panel = code(read("src/components/academy/ApplicationAssessmentPanel.tsx"));
const candidatePage = code(
  read("src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx"),
);
ck(
  "the applications list offers it per row, gated on who may decide and an unresolved status",
  /<SendTestDialog/.test(list) &&
    /canDecideFor\(r\.jobId\) && isUnresolved\(r\.status\)/.test(list) &&
    /data-testid="send-test"/.test(list),
);
ck(
  "the recruitment's candidate table offers it in the Test column, per row, without a selection",
  /<SendTestDialog/.test(table) &&
    /props\.canAssignTests && OPEN\.includes\(r\.status\)/.test(table) &&
    /data-testid="send-test"/.test(table),
);
ck(
  "the candidate page's assessment panel offers it and passes the recipient context",
  /<SendTestDialog/.test(panel) &&
    /candidateName=\{c\.displayName\}/.test(candidatePage) &&
    /jobTitle=\{jobTitle\}/.test(candidatePage),
);
ck(
  "the panel is never silent for somebody who may send",
  /if \(rows\.length === 0 && options\.length === 0 && !canAssign\) return null/.test(panel),
);
ck(
  "the panel no longer offers a button per assessment (one path, one dialog)",
  !/assignFromApplication/.test(panel) && !/sendable\.map/.test(panel),
);
const send = code(read("src/lib/library/start.functions.ts"));
ck(
  "the send records the level (setup) and invites through the recruitment's message channel",
  /scp_record_assessment_setup/.test(send) &&
    /rec_save_message_draft/.test(send) &&
    /deliverRecruitmentMessage/.test(send) &&
    /_idempotency_key: `test-invitation:\$\{p\.assignmentId\}`/.test(send),
);
ck(
  "the send honours the chosen language instead of hardcoding Swedish",
  /_language: data\.language/.test(send) && !/_language: "sv"/.test(send),
);
ck(
  "cancelled and expired invitations have their own words, never 'failed'",
  /journey\.stage\.cancelled/.test(panel) &&
    /journey\.stage\.expired/.test(panel) &&
    (dictionaries.sv["journey.stage.cancelled"] ?? "").length > 0 &&
    (dictionaries.en["journey.stage.expired"] ?? "").length > 0,
);

console.log(`\n${n - failures.length} of ${n} assertions passed`);
if (failures.length > 0) {
  console.error(`\nFAIL — send-test-dialog-check (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — send-test-dialog-check");
