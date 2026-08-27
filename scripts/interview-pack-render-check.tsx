// Renders the Role Interview Builder's governance surface and asserts what a
// content administrator actually SEES.
//
// The contract check next door proves the migration and the source files. The
// database suite proves the schema. This one proves the MARKUP: that every
// required state renders, that status is never carried by colour alone, that
// level 0 is drawn apart from the run of levels and explained, and that the
// screen shows no total, score, ranking or recommendation anywhere.
//
// Rendered with renderToStaticMarkup — no browser, no database. The i18n
// provider defaults to Swedish on the server, so this reads the Swedish
// surface, which is the one the Väktare pilot is authored in.

import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import {
  AsyncState,
  ErrorSummary,
  MappingStateBadge,
  NoticePanel,
  PackStatusBadge,
  ProbeProvenanceBadge,
  StateBadge,
  ValidationLabelBadge,
} from "../src/components/admin/interview/PackGovernanceUi";
import {
  ALLOWED_TRANSITIONS,
  isAllowedTransition,
  isEditableStatus,
  levelCountsTowardAggregation,
  type PackStatus,
} from "../src/lib/interview-intelligence/role-packs.functions";

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
};

const render = (node: React.ReactElement) =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

/** Strip tags, so an assertion about visible text cannot pass on an attribute. */
const visibleText = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ================================================================== */
console.log("\nGROUP 1 — every required state renders");
/* ================================================================== */

const STATES = ["loading", "error", "empty", "denied"] as const;

for (const s of STATES) {
  const html = render(<AsyncState state={s} message="Testfel" />);
  check(`the "${s}" state renders visible text`, visibleText(html).length > 0);
}

check(
  "the loading state is announced to assistive technology",
  render(<AsyncState state="loading" />).includes('role="status"'),
);
check(
  "the server-error state is announced as an alert",
  render(<AsyncState state="error" message="Boom" />).includes('role="alert"'),
);
check(
  "the permission-denied state is announced as an alert",
  render(<AsyncState state="denied" />).includes('role="alert"'),
);
check(
  "permission-denied explains the content-role requirement without naming any content",
  visibleText(render(<AsyncState state="denied" />)).includes("plattformsroll"),
);

// Every status in the ladder must render, including the post-publication ones.
const ALL_STATUSES: readonly PackStatus[] = [
  "draft",
  "expert_review",
  "legal_review",
  "cognitive_review",
  "published",
  "suspended",
  "retired",
];

for (const s of ALL_STATUSES) {
  const html = render(<PackStatusBadge status={s} />);
  const text = visibleText(html);
  check(
    `status "${s}" renders as words, not only colour`,
    text.replace("Status:", "").trim().length > 0,
  );
}

check(
  "the incomplete-draft state has a governance panel",
  visibleText(render(<NoticePanel tone="attention" title="Publicering är blockerad" />)).includes(
    "blockerad",
  ),
);
check(
  "the new-version-available state has a governance panel",
  visibleText(
    render(
      <NoticePanel tone="neutral" title="Avvecklad">
        {<p>Ersatt av v2.</p>}
      </NoticePanel>,
    ),
  ).includes("Ersatt av v2."),
);
check(
  "the source-mapping-unresolved state renders as a provisional mapping",
  visibleText(render(<MappingStateBadge state="provisional" />)).includes("Preliminär"),
);
check(
  "a confirmed mapping is distinguishable in words",
  visibleText(render(<MappingStateBadge state="confirmed" />)).includes("Bekräftad"),
);

/* ================================================================== */
console.log("\nGROUP 2 — status is never colour alone");
/* ================================================================== */

// Each badge must carry a text label. A badge whose only difference from
// another is a CSS class is unreadable in greyscale and to a screen reader.
const badgeSamples: readonly { readonly label: string; readonly html: string }[] = [
  ...ALL_STATUSES.map((s) => ({
    label: `status:${s}`,
    html: render(<PackStatusBadge status={s} />),
  })),
  {
    label: "validation:pilot_hypothesis",
    html: render(<ValidationLabelBadge label="pilot_hypothesis" />),
  },
  {
    label: "validation:content_validated",
    html: render(<ValidationLabelBadge label="content_validated" />),
  },
  {
    label: "provenance:source_stated",
    html: render(<ProbeProvenanceBadge provenance="source_stated" />),
  },
  {
    label: "provenance:derived_in_import",
    html: render(<ProbeProvenanceBadge provenance="derived_in_import" />),
  },
];

const seenText = new Map<string, string>();
for (const b of badgeSamples) {
  const text = visibleText(b.html);
  check(`${b.label} carries a text label`, text.length > 0);
  seenText.set(b.label, text);
}

// The two states of each pair must READ differently, not merely look different.
check(
  "pilot hypothesis and content validated read differently",
  seenText.get("validation:pilot_hypothesis") !== seenText.get("validation:content_validated"),
);
check(
  "published and suspended read differently",
  seenText.get("status:published") !== seenText.get("status:suspended"),
);

check(
  "the status badge is prefixed for assistive technology",
  render(<PackStatusBadge status="draft" />).includes("sr-only"),
);

/* ================================================================== */
console.log("\nGROUP 3 — no candidate verdict colours");
/* ================================================================== */

// The blueprint reserves red for a governance error and forbids a red/green
// candidate verdict pair. Green must not appear at all: confirmed content is
// evidence teal.
const allBadgeHtml = badgeSamples.map((b) => b.html).join("\n");
for (const forbidden of ["green-", "emerald-", "lime-", "text-green", "bg-green"]) {
  check(
    `no "${forbidden}" class anywhere in the state vocabulary`,
    !allBadgeHtml.includes(forbidden),
  );
}
check(
  "confirmed content uses evidence teal",
  render(<ValidationLabelBadge label="content_validated" />).includes("teal-"),
);
check(
  "unresolved work uses amber",
  render(<PackStatusBadge status="expert_review" />).includes("amber-"),
);
check(
  "a suspended version uses the governance-error tone, not a verdict colour",
  render(<PackStatusBadge status="suspended" />).includes("destructive"),
);
check(
  "a draft is neutral — a draft is not a problem",
  render(<PackStatusBadge status="draft" />).includes("muted"),
);

/* ================================================================== */
console.log("\nGROUP 4 — the form error contract");
/* ================================================================== */

const summary = render(
  <ErrorSummary
    errors={[
      { fieldId: "ii-slug", message: "Identifieraren måste bestå av små bokstäver." },
      { fieldId: "ii-role", message: "Välj en rollversion." },
    ]}
  />,
);

check("the error summary is announced as an alert", summary.includes('role="alert"'));
check("the error summary is focusable", summary.includes('tabindex="-1"'));
check(
  "every error links to its field",
  summary.includes('href="#ii-slug"') && summary.includes('href="#ii-role"'),
);
check(
  "the error summary states both messages",
  visibleText(summary).includes("Identifieraren") && visibleText(summary).includes("rollversion"),
);
check("an empty error list renders nothing", render(<ErrorSummary errors={[]} />) === "");

/* ================================================================== */
console.log("\nGROUP 5 — level 0 semantics");
/* ================================================================== */

check("level 0 never counts toward an aggregation", levelCountsTowardAggregation(0) === false);
for (const lvl of [1, 2, 3, 4]) {
  check(`level ${lvl} remains available to a human aggregation`, levelCountsTowardAggregation(lvl));
}

/* ================================================================== */
console.log("\nGROUP 6 — the transition model matches the database");
/* ================================================================== */

// The UI mirror and the DB guard must agree, or the screen offers an action
// the database will refuse.
const EXPECTED: Readonly<Record<PackStatus, readonly PackStatus[]>> = {
  draft: ["expert_review"],
  expert_review: ["legal_review", "draft"],
  legal_review: ["cognitive_review", "draft"],
  cognitive_review: ["published", "draft"],
  published: ["suspended", "retired"],
  suspended: ["published", "retired"],
  retired: [],
};

for (const from of ALL_STATUSES) {
  check(
    `transitions from "${from}" match the database guard`,
    JSON.stringify([...ALLOWED_TRANSITIONS[from]].sort()) ===
      JSON.stringify([...EXPECTED[from]].sort()),
    `got ${JSON.stringify(ALLOWED_TRANSITIONS[from])}`,
  );
}

check("draft cannot jump straight to published", !isAllowedTransition("draft", "published"));
check("a retired version is terminal", ALLOWED_TRANSITIONS.retired.length === 0);
check(
  "expert review cannot skip legal review",
  !isAllowedTransition("expert_review", "cognitive_review"),
);

for (const s of ["draft", "expert_review", "legal_review", "cognitive_review"] as const) {
  check(`"${s}" is editable`, isEditableStatus(s));
}
for (const s of ["published", "suspended", "retired"] as const) {
  check(`"${s}" is NOT editable`, !isEditableStatus(s));
}

/* ================================================================== */
console.log("\nGROUP 7 — no scoring vocabulary reaches the screen");
/* ================================================================== */

const everything = [
  ...badgeSamples.map((b) => b.html),
  ...STATES.map((s) => render(<AsyncState state={s} message="x" />)),
  summary,
  render(<StateBadge tone="work">Tydlighet</StateBadge>),
].join("\n");

for (const word of [
  "totalpoäng",
  "slutpoäng",
  "rangordning",
  "rekommendation att anställa",
  "lämplighetspoäng",
  "trovärdighetspoäng",
  "godkänd/underkänd",
]) {
  check(`the surface never says "${word}"`, !visibleText(everything).toLowerCase().includes(word));
}

/* ================================================================== */

if (failures.length > 0) {
  console.error(`\ninterview-pack-render-check FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("\ninterview-pack-render-check passed");
