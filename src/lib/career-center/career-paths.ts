import type { CareerPath } from "./types";

// Career paths are RELATIONSHIPS between professions.
// They describe possible transitions — never guaranteed progression.
//
// ── WHAT AN EDGE MAY AND MAY NOT CLAIM ─────────────────────────────────
//
// An edge is allowed to say what stands BETWEEN two roles, when that is
// sourced. It is not allowed to say how many people make the move, how long
// it takes, or that one role is a step towards another.
//
// `likelihood` is editorial shorthand and is NEVER rendered on its own: the
// UI shows a frequency label only when an edge carries `frequencyEvidence`,
// and no edge in this dataset does, because no source in this dataset is
// about transition frequency. A statute describing what an ordningsvakt
// appointment requires is evidence about the ROLE. It says nothing at all
// about whether väktare commonly become ordningsvakter.
//
// An edge that carries `status: "researched"`, its own `sources`, `countries`
// and `lastVerified` is publishable as a described transition. Everything
// else renders as "möjlig riktning under granskning", with no likelihood, no
// experience statement and no progression wording. See `transitions.ts`.

const SE = ["SE"] as const;

export const careerPaths: readonly CareerPath[] = [
  // ── FORMAL GATES OUT OF GUARDING ─────────────────────────────────────
  //
  // Both are real, sourced statements about what the destination requires.
  // Neither says a väktare is on the way to becoming one: working as a
  // väktare is not a legal prerequisite for either appointment, and the notes
  // say so rather than implying a ladder.
  {
    from: "security-officer",
    to: "ordningsvakt",
    likelihood: "possible",
    status: "researched",
    lastVerified: "2026-09-08",
    countries: [...SE],
    transferableCompetencies: ["observation", "conflict", "communication", "reporting"],
    notes: {
      sv: "Det här är två skilda regelverk, inte två nivåer av samma yrke. Ordningsvakt förutsätter egen föreskriven utbildning, att du fyllt 20 år, en lämplighetsbedömning och ett förordnande från Polismyndigheten. Att ha arbetat som väktare är inget rättsligt krav.",
      en: "These are two separate regulatory regimes, not two levels of one occupation. A public order officer appointment requires its own prescribed training, being at least 20 years old, a suitability assessment and an appointment by the Police Authority. Having worked as a security officer is not a legal requirement.",
    },
    sources: [
      {
        label: {
          sv: "Lag (2023:421) om ordningsvakter, 9 §",
          en: "Public Order Officers Act (2023:421), section 9",
        },
        publisher: "Sveriges riksdag",
        url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2023421-om-ordningsvakter_sfs-2023-421/",
        retrieved: "2026-09-08",
      },
    ],
  },
  {
    from: "security-officer",
    to: "skyddsvakt",
    likelihood: "possible",
    status: "researched",
    lastVerified: "2026-09-08",
    countries: [...SE],
    transferableCompetencies: ["observation", "reporting", "risk_awareness"],
    notes: {
      sv: "Skyddsvakt kräver föreskriven utbildning enligt Polismyndighetens föreskrifter — eller Försvarsmaktens för dess personal — och ett godkännande av länsstyrelsen i ditt bosättningslän. Uppdraget vid ett skyddsobjekt är ett tredje, separat beslut. Väktarerfarenhet är inget rättsligt krav.",
      en: "A protective security guard needs prescribed training under the Police Authority's regulations — or the Armed Forces' for its own personnel — and approval by the county administrative board where they live. The assignment at a protected object is a third, separate decision. Experience as a security officer is not a legal requirement.",
    },
    sources: [
      {
        label: {
          sv: "Skyddsförordning (2010:523), 6, 14 och 15 §§",
          en: "Protective Security Ordinance (2010:523), sections 6, 14 and 15",
        },
        publisher: "Sveriges riksdag",
        url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skyddsforordning-2010523_sfs-2010-523/",
        retrieved: "2026-09-08",
      },
    ],
  },

  // ── UNREGULATED DIRECTIONS ───────────────────────────────────────────
  //
  // No source in this dataset describes either move. They are recorded
  // because the roles are related, and they render as directions under
  // review: no likelihood, no experience statement, no progression wording.
  // The `experienceRequired` prose an earlier revision carried here was
  // removed rather than suppressed — an unsourced statement about what a
  // move needs is not improved by being hidden.
  {
    from: "security-officer",
    to: "security-coordinator",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "security-coordinator",
    to: "security-manager",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "security-manager",
    to: "security-consultant",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "police-officer",
    to: "security-investigator",
    likelihood: "possible",
    status: "placeholder",
    notes: {
      sv: "Övergången beror på erfarenhet, arbetsgivare och land — inget garanterat spår.",
      en: "Transition depends on experience, employer and country — not a guaranteed path.",
    },
  },
  {
    from: "police-officer",
    to: "intelligence-analyst",
    likelihood: "possible",
    status: "placeholder",
  },
  { from: "police-officer", to: "security-manager", likelihood: "possible", status: "placeholder" },
  {
    from: "military-security-specialist",
    to: "close-protection",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "military-security-specialist",
    to: "data-center-security",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "military-security-specialist",
    to: "security-manager",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "security-technician",
    to: "data-center-security",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "security-technician",
    to: "security-manager",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "aml-specialist",
    to: "fraud-investigator",
    likelihood: "possible",
    status: "placeholder",
  },
  {
    from: "aml-specialist",
    to: "security-consultant",
    likelihood: "possible",
    status: "placeholder",
  },
  { from: "risk-manager", to: "security-manager", likelihood: "possible", status: "placeholder" },
  {
    from: "crisis-continuity-manager",
    to: "security-manager",
    likelihood: "possible",
    status: "placeholder",
  },
  { from: "soc-analyst", to: "security-consultant", likelihood: "possible", status: "placeholder" },
];

export function getPathsFrom(id: string) {
  return careerPaths.filter((p) => p.from === id);
}
export function getPathsTo(id: string) {
  return careerPaths.filter((p) => p.to === id);
}
