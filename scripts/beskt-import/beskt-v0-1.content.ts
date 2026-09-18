/**
 * BESKT v0.1 — the method content of
 *   "CQrityjob BESKT – metodstöd och byggspecifikation v0.1" (10 september 2026),
 * mapped onto the governed, versioned content objects that already exist:
 * exposure profiles, sections, items (+ options), prompts, routing rules,
 * evidence anchors, observation fields and activation requirements.
 *
 * ── PROVENANCE ─────────────────────────────────────────────────────────
 *
 * `source_stated`        the Swedish wording is the specification's own
 *                        (question text, answer grammar labels, FAKTA steps,
 *                        anchor definitions). The source_reference names the
 *                        section and number.
 * `derived_in_authoring` written while importing FROM the specification: every
 *                        English translation, each per-question "Varför frågar
 *                        vi?" purpose, and the neutral wording of prompts whose
 *                        spec text is a checklist step rather than a sentence.
 *                        The five review gates review these as authored text.
 *
 * Nothing here is an approval. Importing writes a DRAFT; publication still
 * takes five named reviewers, each deciding their own gate.
 *
 * ── TWO METHODS, NOT ONE ───────────────────────────────────────────────
 *
 * The specification is written for a security-vetting interview. The schema
 * keeps recruitment support and security vetting apart (mode, access class,
 * retention class, sensitivity class, activation requirements), and the
 * runtime assigns ONLY recruitment_support. So the content becomes two
 * methods:
 *
 *   rekrytering   recruitment_support — the work- and role-related parts:
 *                 the common base (Q1–4), B (Q5–8), the situational scenarios
 *                 (§4.4) and T as the employer's exposure profile plus the
 *                 candidate's acknowledgement. Runnable today.
 *   sakerhet      security_vetting_support — the whole specification,
 *                 including E, S and K as security_vetting_only items, with
 *                 the three activation requirements. Importable and
 *                 reviewable; not assignable until a reviewed activation
 *                 runtime exists (a schema-first decision).
 *
 * Which question belongs in which mode is itself proposed here and decided by
 * the personnel_security and employment_privacy_legal gates.
 */

export type Mode = "recruitment_support" | "security_vetting_support";
export type Sensitivity = "ordinary" | "integrity_sensitive" | "security_vetting_only";
export type AnswerType =
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "short_text"
  | "long_text"
  | "date"
  | "acknowledgement";

export const SOURCE = "CQrityjob BESKT – metodstöd och byggspecifikation v0.1 (2026-09-10)";
export const SOURCE_VERSION = "v0.1 2026-09-10";

/* ------------------------------------------------------------------ */
/* The answer grammar of §4.2                                          */
/* ------------------------------------------------------------------ */
//
// "Vill inte svara" and "Tar muntligt" are NOT options: the schema makes them
// neutral response states (omitted / discuss_orally), and the validator
// refuses an option key that encodes a non-answer. That is the specification's
// own rule — an omission is an information gap, never negative evidence.

export interface OptionDef {
  readonly key: string;
  readonly sv: string;
  readonly en: string;
}

export const OCCURRENCE: readonly OptionDef[] = [
  { key: "nej", sv: "Nej", en: "No" },
  { key: "ja", sv: "Ja", en: "Yes" },
  { key: "osaker", sv: "Osäker", en: "Unsure" },
];
const RECENCY: readonly OptionDef[] = [
  { key: "manader_0_6", sv: "0–6 månader", en: "0–6 months" },
  { key: "manader_7_24", sv: "7–24 månader", en: "7–24 months" },
  { key: "ar_2_5", sv: "2–5 år", en: "2–5 years" },
  { key: "over_5_ar", sv: "Mer än 5 år", en: "More than 5 years" },
];
const PATTERN: readonly OptionDef[] = [
  { key: "en_handelse", sv: "En händelse", en: "One event" },
  { key: "flera", sv: "Flera", en: "Several" },
  { key: "pagaende", sv: "Pågående", en: "Ongoing" },
];
const STATUS: readonly OptionDef[] = [
  { key: "avslutat", sv: "Avslutat", en: "Concluded" },
  { key: "delvis_hanterat", sv: "Delvis hanterat", en: "Partly dealt with" },
  { key: "pagaende", sv: "Pågående", en: "Ongoing" },
  { key: "osaker", sv: "Osäker", en: "Unsure" },
];

/** The follow-up fields of the grammar, shown when the occurrence is Ja or Osäker. */
export const GRAMMAR_FOLLOW_UPS: ReadonlyArray<{
  suffix: string;
  answerType: AnswerType;
  options?: readonly OptionDef[];
  sv: string;
  en: string;
  purposeSv: string;
  purposeEn: string;
}> = [
  {
    suffix: "aktualitet",
    answerType: "single_choice",
    options: RECENCY,
    sv: "Aktualitet: när inträffade det senast?",
    en: "Recency: when did it last happen?",
    purposeSv:
      "Tidsramen visar om uppgiften kan vara aktuell för rollen; äldre händelser väger inte automatiskt lätt eller tungt.",
    purposeEn:
      "The time frame shows whether the matter can be current for the role; older events carry no automatic weight either way.",
  },
  {
    suffix: "monster",
    answerType: "single_choice",
    options: PATTERN,
    sv: "Mönster",
    en: "Pattern",
    purposeSv: "Skiljer en enstaka händelse från något som upprepats eller pågår.",
    purposeEn: "Distinguishes a single event from something repeated or ongoing.",
  },
  {
    suffix: "nulage",
    answerType: "single_choice",
    options: STATUS,
    sv: "Nuläge",
    en: "Current status",
    purposeSv: "Visar om situationen är avslutad eller fortfarande pågår.",
    purposeEn: "Shows whether the situation has concluded or is still ongoing.",
  },
  {
    suffix: "beskrivning",
    answerType: "long_text",
    sv: "Egen beskrivning (frivillig, kort – högst 500 tecken)",
    en: "Your own description (voluntary, brief – at most 500 characters)",
    purposeSv: "Din egen kontext, med dina ord. Beskriv bara det som behövs.",
    purposeEn: "Your own context, in your own words. Describe only what is needed.",
  },
  {
    suffix: "forandring",
    answerType: "short_text",
    sv: "Vad har förändrats?",
    en: "What has changed?",
    purposeSv: "Förändring och lärdom är lika relevanta som själva händelsen.",
    purposeEn: "Change and learning are as relevant as the event itself.",
  },
  {
    suffix: "stod",
    answerType: "short_text",
    sv: "Stöd eller skyddsfaktor",
    en: "Support or protective factor",
    purposeSv: "Stöd, kontroller och förändrat beteende visas alltid tillsammans med uppgiften.",
    purposeEn: "Support, controls and changed behaviour are always shown together with the matter.",
  },
  {
    suffix: "verifiering",
    answerType: "short_text",
    sv: "Möjlig verifiering (referens, dokument eller annan källa – frivilligt)",
    en: "Possible verification (reference, document or other source – voluntary)",
    purposeSv:
      "En källa kan stödja, nyansera eller motsäga uppgiften. Det är frivilligt i detta steg.",
    purposeEn:
      "A source can support, qualify or contradict the matter. It is voluntary at this stage.",
  },
];

/* ------------------------------------------------------------------ */
/* The question bank of §4.3 and the scenarios of §4.4                 */
/* ------------------------------------------------------------------ */

export type Domain = "bas" | "b" | "e" | "s" | "k" | "t" | "situation";

export interface QuestionDef {
  /** Stable key: the spec's own number where it has one. */
  readonly key: string;
  readonly domain: Domain;
  readonly specRef: string;
  /** "incident" questions carry the §4.2 grammar; "open" ones are free text. */
  readonly shape: "incident" | "open" | "choice";
  readonly sv: string;
  readonly en: string;
  readonly purposeSv: string;
  readonly purposeEn: string;
  readonly sensitivity: Sensitivity;
  readonly options?: readonly OptionDef[];
  /** Where the specification wants a safer oral route to be offered. */
  readonly oralRecommended?: boolean;
  /** The proposed mode. The gates decide. */
  readonly mode: Mode;
  readonly prohibited: readonly string[];
}

const BASE_PROHIBITED = [
  "suitability_inference",
  "credibility_or_deception_inference",
  "omission_as_negative_evidence",
] as const;
const SENSITIVE_PROHIBITED = [
  ...BASE_PROHIBITED,
  "sensitive_trait_inference",
  "protected_trait_proxy",
  "personality_or_health_diagnosis",
] as const;

export const QUESTIONS: readonly QuestionDef[] = [
  // ---- Rollförståelse och säkerhetsbeteende – gemensam bas ----------------
  {
    key: "q01_sakerhetsregel",
    domain: "bas",
    specRef: "§4.3 fråga 1",
    shape: "open",
    sv: "Beskriv en situation där du följde en säkerhetsregel trots att den gjorde arbetet svårare. Vad gjorde du och vad blev resultatet?",
    en: "Describe a situation in which you followed a security rule even though it made the work harder. What did you do, and what was the result?",
    purposeSv:
      "Ett konkret exempel ger intervjun något att utgå från om hur säkerhetsregler hanteras i praktiken.",
    purposeEn:
      "A concrete example gives the interview a starting point for how security rules are handled in practice.",
    sensitivity: "ordinary",
    mode: "recruitment_support",
    prohibited: BASE_PROHIBITED,
  },
  {
    key: "q02_misstag",
    domain: "bas",
    specRef: "§4.3 fråga 2",
    shape: "incident",
    sv: "Har du under de senaste fem åren gjort eller upptäckt ett misstag som kunde påverka informationssäkerhet, personsäkerhet eller verksamhetens skydd?",
    en: "In the last five years, have you made or discovered a mistake that could have affected information security, personal safety or the organisation's protection?",
    purposeSv:
      "Hur ett misstag rapporterades och rättades säger mer än att det inträffade. Ett misstag är inte i sig negativt.",
    purposeEn:
      "How a mistake was reported and corrected says more than that it happened. A mistake is not negative in itself.",
    sensitivity: "ordinary",
    mode: "recruitment_support",
    prohibited: BASE_PROHIBITED,
  },
  {
    key: "q03_kringga_regel",
    domain: "bas",
    specRef: "§4.3 fråga 3",
    shape: "incident",
    sv: "Har en chef, kollega eller annan person bett dig kringgå en regel, dela behörighet eller göra ett undantag?",
    en: "Has a manager, colleague or someone else asked you to get around a rule, share access rights or make an exception?",
    purposeSv: "Frågan gäller hur du agerade när någon annan ville att en regel skulle kringgås.",
    purposeEn:
      "The question is about how you acted when someone else wanted a rule to be bypassed.",
    sensitivity: "ordinary",
    mode: "recruitment_support",
    prohibited: BASE_PROHIBITED,
  },
  {
    key: "q04_rollens_ansvar",
    domain: "bas",
    specRef: "§4.3 fråga 4",
    shape: "open",
    sv: "Finns det något i den aktuella rollens ansvar som du vill få förklarat före intervjun?",
    en: "Is there anything about the responsibilities of this role that you would like explained before the interview?",
    purposeSv: "Ger dig möjlighet att förbereda intervjun på dina egna villkor.",
    purposeEn: "Gives you the chance to prepare for the interview on your own terms.",
    sensitivity: "ordinary",
    mode: "recruitment_support",
    prohibited: BASE_PROHIBITED,
  },

  // ---- B – Besvikelse och konflikter --------------------------------------
  {
    key: "q05_konflikt_atgard",
    domain: "b",
    specRef: "§4.3 fråga 5",
    shape: "incident",
    sv: "Har en konflikt i arbete eller uppdrag under de senaste fem åren lett till formell åtgärd, avslut eller en längre tvist?",
    en: "In the last five years, has a conflict at work or in an assignment led to formal action, termination or a lengthy dispute?",
    purposeSv:
      "En konflikt är inte i sig en risk. Frågan gäller om något olöst kan påverka hur regler följs i rollen.",
    purposeEn:
      "A conflict is not a risk in itself. The question is whether anything unresolved could affect how rules are followed in the role.",
    sensitivity: "integrity_sensitive",
    mode: "recruitment_support",
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q06_olost_oforratt",
    domain: "b",
    specRef: "§4.3 fråga 6",
    shape: "incident",
    sv: "Finns en allvarlig upplevd oförrätt i arbete eller uppdrag som fortfarande är olöst och påverkar hur du agerar i dag?",
    en: "Is there a serious perceived injustice at work or in an assignment that is still unresolved and affects how you act today?",
    purposeSv: "Frågan gäller aktuell påverkan på handlande, inte känslor eller personlighet.",
    purposeEn: "The question is about current effect on conduct, not feelings or personality.",
    sensitivity: "integrity_sensitive",
    mode: "recruitment_support",
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q07_ilska_regelbrott",
    domain: "b",
    specRef: "§4.3 fråga 7",
    shape: "incident",
    sv: "Har ilska eller besvikelse lett till att du bröt mot en regel, undanhöll relevant information eller agerade på ett sätt du senare behövde rätta?",
    en: "Has anger or disappointment led you to break a rule, withhold relevant information or act in a way you later needed to correct?",
    purposeSv: "Frågan gäller konkreta handlingar och hur de rättades, inte sinnesstämning.",
    purposeEn: "The question is about concrete actions and how they were corrected, not mood.",
    sensitivity: "integrity_sensitive",
    mode: "recruitment_support",
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q08_motgang",
    domain: "b",
    specRef: "§4.3 fråga 8",
    shape: "open",
    sv: "Beskriv din senaste större professionella motgång: vad hände, hur agerade du, vad lärde du dig och vad skulle en referens säga?",
    en: "Describe your most recent significant professional setback: what happened, how you acted, what you learned, and what a referee would say.",
    purposeSv:
      "Hur en motgång hanterades ger underlag för intervjun. Frågan gäller hanteringen, inte motgången i sig.",
    purposeEn:
      "How a setback was handled gives the interview a basis. The question does not weigh the setback itself.",
    sensitivity: "ordinary",
    mode: "recruitment_support",
    prohibited: BASE_PROHIBITED,
  },

  // ---- E – Ekonomi (security vetting only) ---------------------------------
  {
    key: "q09_ekonomisk_press",
    domain: "e",
    specRef: "§4.3 fråga 9",
    shape: "incident",
    sv: "Finns i dag förfallna åtaganden, indrivning, betalningsplan eller annat som skapar betydande ekonomisk press?",
    en: "Are there currently overdue obligations, debt collection, a payment plan or anything else creating significant financial pressure?",
    purposeSv: "Skuld är inte i sig en säkerhetsrisk. Exakta belopp efterfrågas inte.",
    purposeEn: "Debt is not a security risk in itself. Exact amounts are not asked for.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q10_forsamrad_ekonomi",
    domain: "e",
    specRef: "§4.3 fråga 10",
    shape: "incident",
    sv: "Har din ekonomiska situation försämrats väsentligt under de senaste 24 månaderna?",
    en: "Has your financial situation deteriorated significantly in the last 24 months?",
    purposeSv:
      "En förändring ger underlag för ett samtal om hantering och stöd. Den säger inget om dig som person.",
    purposeEn:
      "A change gives a basis for a conversation about how it is handled and supported, not an assessment of you.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q11_ekonomiskt_beroende",
    domain: "e",
    specRef: "§4.3 fråga 11",
    shape: "incident",
    sv: "Finns ett ekonomiskt beroende eller en skyldighet till en person eller organisation som kan komma i konflikt med den aktuella rollen?",
    en: "Is there a financial dependence on, or obligation to, a person or organisation that could conflict with this role?",
    purposeSv: "Frågan gäller konkreta beroenden som kan krocka med rollen.",
    purposeEn: "The question is about concrete dependencies that could clash with the role.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q12_ekonomisk_plan",
    domain: "e",
    specRef: "§4.3 fråga 12",
    shape: "open",
    sv: "Om en ekonomisk situation finns: hur hanteras den, vilket stöd finns och vad visar att planen fungerar?",
    en: "If there is a financial situation: how is it being handled, what support exists, and what shows that the plan is working?",
    purposeSv: "Hantering och stöd visas alltid tillsammans med själva situationen.",
    purposeEn: "Handling and support are always shown together with the situation itself.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },

  // ---- S – Social situation och belastningar (security vetting only) -------
  {
    key: "q13_livsforandring",
    domain: "s",
    specRef: "§4.3 fråga 13",
    shape: "incident",
    sv: "Har en större förändring i livssituationen nyligen påverkat din förmåga att fullgöra viktiga skyldigheter eller hantera press?",
    en: "Has a major change in your life situation recently affected your ability to meet important obligations or handle pressure?",
    purposeSv: "Frågan gäller påverkan på skyldigheter, inte vilken förändringen var.",
    purposeEn: "The question is about the effect on obligations, not what the change was.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q14_stod_vid_press",
    domain: "s",
    specRef: "§4.3 fråga 14",
    shape: "choice",
    options: OCCURRENCE,
    sv: "Har du tillgång till stöd när du utsätts för stark press, hot eller svåra beslut?",
    en: "Do you have access to support when you face strong pressure, threats or difficult decisions?",
    purposeSv: "Stöd är en skyddsfaktor och visas som sådan.",
    purposeEn: "Support is a protective factor and is shown as one.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q15_alkohol_droger_spel",
    domain: "s",
    specRef: "§4.3 fråga 15",
    shape: "incident",
    sv: "Har alkohol, droger eller spel under de senaste fem åren lett till missad skyldighet, konflikt, ekonomisk konsekvens eller försämrad förmåga att fatta beslut? Frågan gäller konsekvenser, inte diagnos.",
    en: "In the last five years, has alcohol, drugs or gambling led to a missed obligation, conflict, financial consequence or reduced ability to make decisions? The question is about consequences, not diagnosis.",
    purposeSv: "Frågan gäller konsekvenser för skyldigheter, aldrig diagnos eller behandling.",
    purposeEn: "The question is about consequences for obligations, never diagnosis or treatment.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q16_hot_tvang",
    domain: "s",
    specRef: "§4.3 fråga 16",
    shape: "incident",
    sv: "Har du utsatts för hot, tvång, trakasserier eller en situation där någon skulle kunna försöka utnyttja information om dig?",
    en: "Have you been subjected to threats, coercion, harassment or a situation in which someone could try to exploit information about you?",
    purposeSv:
      "Du kan välja att ta detta muntligt. Frågan finns för att kunna erbjuda skydd, inte för att pröva dig.",
    purposeEn:
      "You can choose to take this orally. The question exists to offer protection, not to assess you.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },

  // ---- K – Kontakter, bindningar och påverkan (security vetting only) ------
  {
    key: "q17_relation_begaran",
    domain: "k",
    specRef: "§4.3 fråga 17",
    shape: "incident",
    sv: "Finns en privat eller professionell relation eller skyldighet där någon skulle kunna begära information, åtkomst eller tjänster som strider mot rollen?",
    en: "Is there a private or professional relationship or obligation through which someone could ask for information, access or services that conflict with the role?",
    purposeSv:
      "Frågan gäller konkreta bindningar och beroenden, aldrig nationalitet eller ursprung.",
    purposeEn: "The question is about concrete ties and dependencies, never nationality or origin.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q18_bisyssla",
    domain: "k",
    specRef: "§4.3 fråga 18",
    shape: "incident",
    sv: "Finns ett externt uppdrag, en bisyssla, ägarintresse eller annan bindning som kan skapa delade skyldigheter?",
    en: "Is there an external assignment, secondary occupation, ownership interest or other tie that could create divided obligations?",
    purposeSv:
      "Delade skyldigheter kan ofta hanteras; frågan gör dem synliga så att de kan hanteras.",
    purposeEn:
      "Divided obligations can often be managed; the question makes them visible so they can be.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q19_paverkansforsok",
    domain: "k",
    specRef: "§4.3 fråga 19",
    shape: "incident",
    sv: "Har någon försökt påverka, rekrytera, gränstesta eller få en otillbörlig tjänst av dig?",
    en: "Has anyone tried to influence, recruit, test your boundaries or obtain an improper favour from you?",
    purposeSv:
      "Att ha blivit utsatt för ett försök är inte negativt; hur du reagerade och rapporterade är det intressanta.",
    purposeEn:
      "Having been approached is not negative; how you reacted and reported is what matters.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },
  {
    key: "q20_beroende_relation",
    domain: "k",
    specRef: "§4.3 fråga 20",
    shape: "incident",
    sv: "Finns en relation till en person eller aktör som skapar faktiskt beroende, påverkan eller rollkonflikt? Nationalitet eller ursprung är aldrig negativ evidens i sig.",
    en: "Is there a relationship with a person or organisation that creates actual dependence, influence or a role conflict? Nationality or origin is never negative evidence in itself.",
    purposeSv:
      "Frågan gäller faktiskt beroende eller rollkonflikt. Nationalitet eller ursprung är aldrig negativ evidens.",
    purposeEn:
      "The question is about actual dependence or role conflict. Nationality or origin is never negative evidence.",
    sensitivity: "security_vetting_only",
    mode: "security_vetting_support",
    oralRecommended: true,
    prohibited: SENSITIVE_PROHIBITED,
  },

  // ---- Situationsbaserade frågor (§4.4) --------------------------------------
  //
  // The specification has the candidate choose the most likely first action and
  // explain why, but lists no action options. Options are not invented here:
  // each scenario is a free-text answer until the reviewers define options.
  // Before validation the answer is conversation material only — never right
  // or wrong.
  ...(
    [
      [
        "s1_akut_order",
        "en chef kräver en akut åtgärd som strider mot åtkomstregeln",
        "a manager demands urgent action that conflicts with the access rule",
      ],
      [
        "s2_lana_inloggning",
        "en kollega vill låna din inloggning eller behörighet",
        "a colleague wants to borrow your login or access rights",
      ],
      [
        "s3_eget_misstag",
        "du upptäcker ett eget misstag som ännu inte fått någon konsekvens",
        "you discover a mistake of your own that has not yet had any consequence",
      ],
      [
        "s4_litet_undantag",
        "en betrodd kontakt ber om ett ”litet” undantag eller intern information",
        "a trusted contact asks for a “small” exception or internal information",
      ],
      [
        "s5_ej_godkand_ai",
        "ett generativt AI-verktyg verkar effektivt men är inte godkänt för informationen",
        "a generative AI tool seems efficient but is not approved for the information",
      ],
      [
        "s6_distansarbete",
        "arbete på distans skapar konflikt mellan leverans och säker rutin",
        "remote work creates a conflict between delivery and a secure routine",
      ],
    ] as const
  ).map(
    ([key, sv, en], i): QuestionDef => ({
      key,
      domain: "situation",
      specRef: `§4.4 scenario ${i + 1}`,
      shape: "open",
      sv: `Situation: ${sv}. Vad skulle du troligen göra först, och varför?`,
      en: `Situation: ${en}. What would you most likely do first, and why?`,
      purposeSv: "Svaret är samtalsunderlag inför intervjun. Det finns inget rätt eller fel svar.",
      purposeEn:
        "The answer is material for the interview conversation. There is no right or wrong answer.",
      sensitivity: "ordinary",
      mode: "recruitment_support",
      prohibited: BASE_PROHIBITED,
    }),
  ),

  // ---- T – Tillfälle (§4.3 T) -------------------------------------------------
  //
  // T is not a candidate block: the employer's declassified exposure profile
  // carries it. The candidate only confirms understanding and may describe
  // earlier experience of similar responsibility.
  {
    key: "t01_forstaelse",
    domain: "t",
    specRef: "§4.3 T",
    shape: "open",
    sv: "Jag har läst beskrivningen av rollens ansvar och exponering.",
    en: "I have read the description of the role's responsibilities and exposure.",
    purposeSv:
      "Tillfälle bedöms utifrån rollen, inte utifrån dig. Du bekräftar bara att du har läst beskrivningen.",
    purposeEn:
      "Opportunity is assessed from the role, not from you. You only confirm that you have read the description.",
    sensitivity: "ordinary",
    mode: "recruitment_support",
    prohibited: BASE_PROHIBITED,
  },
  {
    key: "t02_tidigare_ansvar",
    domain: "t",
    specRef: "§4.3 T",
    shape: "open",
    sv: "Beskriv gärna tidigare erfarenhet av liknande ansvar.",
    en: "If you wish, describe earlier experience of similar responsibility.",
    purposeSv: "Frivilligt. Ger intervjun en utgångspunkt i din erfarenhet.",
    purposeEn: "Voluntary. Gives the interview a starting point in your experience.",
    sensitivity: "ordinary",
    mode: "recruitment_support",
    prohibited: BASE_PROHIBITED,
  },
];

export const SECTIONS: ReadonlyArray<{ key: string; domain: Domain; sv: string; en: string }> = [
  {
    key: "t_roll_och_tillfalle",
    domain: "t",
    sv: "Rollen och dess exponering",
    en: "The role and its exposure",
  },
  {
    key: "bas_sakerhetsbeteende",
    domain: "bas",
    sv: "Rollförståelse och säkerhetsbeteende",
    en: "Role understanding and security behaviour",
  },
  {
    key: "b_besvikelse_konflikter",
    domain: "b",
    sv: "B – Besvikelse och konflikter",
    en: "B – Disappointment and conflicts",
  },
  { key: "e_ekonomi", domain: "e", sv: "E – Ekonomi", en: "E – Finances" },
  {
    key: "s_social_situation",
    domain: "s",
    sv: "S – Social situation och belastningar",
    en: "S – Social situation and pressures",
  },
  {
    key: "k_kontakter",
    domain: "k",
    sv: "K – Kontakter, bindningar och påverkan",
    en: "K – Contacts, ties and influence",
  },
  { key: "situationer", domain: "situation", sv: "Situationer", en: "Situations" },
];

/* ------------------------------------------------------------------ */
/* The interview: §5.1 structure and the §5.2 FAKTA chain, as prompts  */
/* ------------------------------------------------------------------ */

export interface PromptDef {
  readonly key: string;
  readonly kind: string;
  readonly stage: "planning" | "engage_explain" | "account" | "closure" | "evaluation";
  readonly form: string;
  readonly bases: readonly string[];
  readonly sv: string;
  readonly en: string;
  readonly specRef: string;
  readonly provenance: "source_stated" | "derived_in_authoring";
  readonly evaluationKey?: "method_adherence" | "basis_gaps" | "next_step_planning";
}

// Order matters: the validator requires open and free account before any probe,
// a behavioural example before detail, context and correction after the last
// probe, and the summary last in the account stage.
export const PROMPTS: readonly PromptDef[] = [
  // §5.1 step 2 — role and exposure (the interviewer's planning)
  {
    key: "p01_roll_och_exponering",
    kind: "planning_from_role_relevance",
    stage: "planning",
    form: "information_notice",
    bases: [],
    specRef: "§5.1 steg 2, §5.2 steg 8",
    sv: "Utgå från den avhemligade exponeringsprofilen. Koppla bara konkreta omständigheter till rollens faktiska åtkomst och handlingsmöjlighet.",
    en: "Start from the declassified exposure profile. Link only concrete circumstances to the role's actual access and scope for action.",
    provenance: "derived_in_authoring",
  },
  // §5.1 step 1 — frames
  {
    key: "p02_syfte",
    kind: "purpose_explanation",
    stage: "engage_explain",
    form: "information_notice",
    bases: [],
    specRef: "§5.1 steg 1",
    sv: "Syftet med samtalet är att klarlägga uppgifter. Beslutet fattas av en behörig människa, inte av samtalet eller systemet.",
    en: "The purpose of this conversation is to clarify information. The decision is made by an authorised person, not by the conversation or the system.",
    provenance: "derived_in_authoring",
  },
  {
    key: "p03_dokumentation",
    kind: "process_explanation",
    stage: "engage_explain",
    form: "information_notice",
    bases: [],
    specRef: "§5.1 steg 1",
    sv: "Så går det till: vi går igenom rollen, ditt underlag och några teman. Det som sägs dokumenteras, och du får höra det återläst.",
    en: "This is how it works: we go through the role, your preparation and a few themes. What is said is documented, and it will be read back to you.",
    provenance: "derived_in_authoring",
  },
  {
    key: "p04_frivillighet",
    kind: "voluntariness_notice",
    stage: "engage_explain",
    form: "information_notice",
    bases: [],
    specRef: "§4.2, §5.1 steg 1",
    sv: "Du väljer själv vad du berättar. Att inte svara är en informationslucka, aldrig negativ bevisning.",
    en: "You choose what you tell. Not answering is an information gap, never negative evidence.",
    provenance: "derived_in_authoring",
  },
  {
    key: "p05_uppgifter_och_rattigheter",
    kind: "data_use_and_rights_notice",
    stage: "engage_explain",
    form: "information_notice",
    bases: [],
    specRef: "§4.1, §6",
    sv: "Dina uppgifter används för den här rollen. Du kan rätta sakfel, och arbetsgivarens rapport delas inte automatiskt med dig.",
    en: "Your information is used for this role. You can correct factual errors, and the employer's report is not shared with you automatically.",
    provenance: "derived_in_authoring",
  },
  {
    key: "p06_manskligt_beslut",
    kind: "human_decision_notice",
    stage: "engage_explain",
    form: "information_notice",
    bases: [],
    specRef: "§1, §5.1 steg 9",
    sv: "Systemet fattar inget beslut. En behörig människa gör helhetsbedömningen.",
    en: "The system makes no decision. An authorised person makes the overall assessment.",
    provenance: "derived_in_authoring",
  },
  {
    key: "p07_muntlig_vag",
    kind: "autonomy_offer",
    stage: "engage_explain",
    form: "information_notice",
    bases: [],
    specRef: "§4.2",
    sv: "Om något känns bättre att ta muntligt kan vi göra det nu.",
    en: "If anything feels better to take orally, we can do that now.",
    provenance: "derived_in_authoring",
  },
  // §5.1 step 4 — BESK core
  {
    key: "p08_oppen_inbjudan",
    kind: "open_invitation",
    stage: "account",
    form: "open_question",
    bases: [],
    specRef: "§5.1 steg 4",
    sv: "Berätta om ditt arbete med säkerhet i tidigare roller.",
    en: "Tell me about your work with security in earlier roles.",
    provenance: "derived_in_authoring",
  },
  // §5.2 FAKTA step 1 — Fakta
  {
    key: "p09_fakta",
    kind: "free_account",
    stage: "account",
    form: "free_recall",
    bases: [],
    specRef: "§5.2 steg 1 Fakta",
    sv: "Vad hände konkret?",
    en: "What concretely happened?",
    provenance: "source_stated",
  },
  {
    key: "p10_exempel",
    kind: "behavioural_example",
    stage: "account",
    form: "cued_recall",
    bases: ["submitted_answer"],
    specRef: "§5.1 steg 4",
    sv: "Ge ett konkret exempel från det du beskrev i ditt underlag.",
    en: "Give a concrete example from what you described in your preparation.",
    provenance: "derived_in_authoring",
  },
  {
    key: "p11_aterspegling",
    kind: "listening_reflection",
    stage: "account",
    form: "reflective_readback",
    bases: [],
    specRef: "§5.1 steg 7",
    sv: "Om jag har förstått dig rätt var det så här det gick till.",
    en: "If I have understood you correctly, this is how it went.",
    provenance: "derived_in_authoring",
  },
  // §5.2 FAKTA steps 2, 3, 6, 7, 9 — detail, after the example
  {
    key: "p12_aktualitet",
    kind: "specific_probe",
    stage: "account",
    form: "neutral_clarification",
    bases: ["submitted_answer"],
    specRef: "§5.2 steg 2 Aktualitet",
    sv: "Under vilken tid pågick det, och pågår det fortfarande?",
    en: "Over what period did it go on, and is it still going on?",
    provenance: "derived_in_authoring",
  },
  {
    key: "p13_konsekvens",
    kind: "specific_probe",
    stage: "account",
    form: "neutral_clarification",
    bases: ["submitted_answer"],
    specRef: "§5.2 steg 3 Konsekvens",
    sv: "Vad blev följden för arbetet, dina skyldigheter eller säkerhetsbeteendet?",
    en: "What was the consequence for the work, your obligations or security behaviour?",
    provenance: "derived_in_authoring",
  },
  {
    key: "p14_atgard",
    kind: "specific_probe",
    stage: "account",
    form: "neutral_clarification",
    bases: ["submitted_answer"],
    specRef: "§5.2 steg 6 Åtgärd",
    sv: "Vad har du eller organisationen gjort med anledning av det?",
    en: "What have you or the organisation done about it?",
    provenance: "derived_in_authoring",
  },
  {
    key: "p15_skyddsfaktor",
    kind: "specific_probe",
    stage: "account",
    form: "neutral_clarification",
    bases: ["submitted_answer"],
    specRef: "§5.2 steg 7 Skyddsfaktor",
    sv: "Vilket stöd, vilken kontroll eller vilket förändrat beteende finns i dag?",
    en: "What support, control or changed behaviour exists today?",
    provenance: "derived_in_authoring",
  },
  {
    key: "p16_verifiering",
    kind: "specific_probe",
    stage: "account",
    form: "neutral_clarification",
    bases: ["submitted_answer", "candidate_supplied_document"],
    specRef: "§5.2 steg 9 Verifiering",
    sv: "Finns det en källa, till exempel en referens eller ett dokument, som kan belysa uppgiften?",
    en: "Is there a source, such as a referee or a document, that can shed light on this?",
    provenance: "derived_in_authoring",
  },
  // §5.2 steps 4–5 and §5.1 step 6 — the candidate's own interpretation and
  // counter-information, after the last probe
  {
    key: "p17_egen_tolkning",
    kind: "context_opportunity",
    stage: "account",
    form: "open_question",
    bases: [],
    specRef: "§5.2 steg 4 Tolkning av kandidaten",
    sv: "Hur förklarar du själv det som hände?",
    en: "How do you yourself explain what happened?",
    provenance: "source_stated",
  },
  {
    key: "p18_alternativ_forklaring",
    kind: "context_opportunity",
    stage: "account",
    form: "open_question",
    bases: [],
    specRef: "§5.2 steg 5 Alternativförklaring, §5.1 steg 6",
    sv: "Finns det omständigheter som gör att detta inte påverkar hur du skulle arbeta i rollen i dag?",
    en: "Are there circumstances that mean this would not affect how you would work in the role today?",
    provenance: "derived_in_authoring",
  },
  // §4.5 date conflict and §5.1 step 3 — the candidate's own preparation
  {
    key: "p19_tidslinje",
    kind: "neutral_difference_exploration",
    stage: "account",
    form: "neutral_clarification",
    bases: ["submitted_answer", "candidate_correction"],
    specRef: "§4.5 faktisk datumkonflikt",
    sv: "Uppgifterna anger två olika tidpunkter. Hur ser tidslinjen ut?",
    en: "The information gives two different points in time. What does the timeline look like?",
    provenance: "derived_in_authoring",
  },
  {
    key: "p20_ratta",
    kind: "correction_opportunity",
    stage: "account",
    form: "open_question",
    bases: [],
    specRef: "§5.1 steg 3 och 7",
    sv: "Stämmer uppgifterna i ditt underlag, eller vill du rätta något?",
    en: "Is the information in your preparation correct, or would you like to correct anything?",
    provenance: "derived_in_authoring",
  },
  // §5.1 step 7 — read-back, last
  {
    key: "p21_aterlasning",
    kind: "summary_confirmation",
    stage: "account",
    form: "summary_readback",
    bases: [],
    specRef: "§5.1 steg 7 Återläsning",
    sv: "Jag läser tillbaka det viktigaste. Har jag uppfattat dig rätt?",
    en: "I will read back the key points. Have I understood you correctly?",
    provenance: "derived_in_authoring",
  },
  // §5.1 step 9 — what happens next
  {
    key: "p22_nasta_steg",
    kind: "closure_next_step",
    stage: "closure",
    form: "information_notice",
    bases: [],
    specRef: "§5.1 steg 9",
    sv: "Nästa steg är att en behörig person gör helhetsbedömningen och dokumenterar skälen.",
    en: "The next step is that an authorised person makes the overall assessment and documents the reasons.",
    provenance: "derived_in_authoring",
  },
  // §5.1 step 8 and §5.2 step 10 — the interviewer's own evaluation, templated
  {
    key: "p23_metodfoljsamhet",
    kind: "interviewer_self_review",
    stage: "evaluation",
    form: "reflective_readback",
    bases: [],
    specRef: "§5.1 steg 8",
    evaluationKey: "method_adherence",
    sv: "",
    en: "",
    provenance: "derived_in_authoring",
  },
  {
    key: "p24_informationsluckor",
    kind: "interviewer_self_review",
    stage: "evaluation",
    form: "reflective_readback",
    bases: [],
    specRef: "§5.2 steg 10 Informationslucka",
    evaluationKey: "basis_gaps",
    sv: "",
    en: "",
    provenance: "derived_in_authoring",
  },
  {
    key: "p25_nasta_steg_planering",
    kind: "interviewer_self_review",
    stage: "evaluation",
    form: "reflective_readback",
    bases: [],
    specRef: "§6 punkt 8",
    evaluationKey: "next_step_planning",
    sv: "",
    en: "",
    provenance: "derived_in_authoring",
  },
];

/* ------------------------------------------------------------------ */
/* §5.3 — the seven evidence states, mapped from the four anchors      */
/* ------------------------------------------------------------------ */

export const ANCHORS: ReadonlyArray<{
  state: string;
  specRef: string;
  nextAction: string;
  defSv: string;
  defEn: string;
  inclSv: string;
  inclEn: string;
  exclSv: string;
  exclEn: string;
  suppSv: string;
  suppEn: string;
  counterSv: string;
  counterEn: string;
  prohibited: readonly string[];
}> = [
  {
    state: "unaddressed",
    specRef: "§5.3 Arbetsstatus: ej behandlad",
    nextAction: "clarify_with_candidate",
    defSv: "Temat har inte behandlats i samtalet.",
    defEn: "The theme has not been addressed in the conversation.",
    inclSv: "Inget har ännu frågats eller dokumenterats om temat.",
    inclEn: "Nothing has yet been asked or documented on the theme.",
    exclSv:
      "Ett tema där kandidaten valt att inte svara – det är en informationslucka, inte obehandlat.",
    exclEn:
      "A theme the candidate chose not to answer – that is an information gap, not unaddressed.",
    suppSv: "Temat finns i intervjuns lista men saknar dokumentation.",
    suppEn: "The theme is on the interview list but has no documentation.",
    counterSv: "Kandidaten kan ha tagit upp temat i ett annat sammanhang.",
    counterEn: "The candidate may have raised the theme in another context.",
    prohibited: ["omission_as_negative_evidence", "suitability_inference"],
  },
  {
    state: "clarification_needed",
    specRef: "§5.3 ankare: Behöver klargöras",
    nextAction: "clarify_with_candidate",
    defSv: "Relevant information saknas, är motsägande eller ännu inte verifierad.",
    defEn: "Relevant information is missing, contradictory or not yet verified.",
    inclSv: "Kandidatens uppgift behöver kompletteras innan den kan förstås.",
    inclEn: "The candidate's information needs to be completed before it can be understood.",
    exclSv: "En uppgift som redan är konkret och samstämmig.",
    exclEn: "Information that is already concrete and consistent.",
    suppSv: "Tidslinje, omfattning eller nuläge är oklart.",
    suppEn: "Timeline, scope or current status is unclear.",
    counterSv: "Kandidatens egen förklaring och kända skyddsfaktorer.",
    counterEn: "The candidate's own explanation and known protective factors.",
    prohibited: ["credibility_or_deception_inference", "suitability_inference"],
  },
  {
    state: "sufficiently_clarified",
    specRef: "§5.3 ankare: Ingen påvisad aktuell rollrelevans",
    nextAction: "none",
    defSv: "Konkret och samstämmigt underlag; ingen tydlig koppling till aktuell exponering.",
    defEn: "Concrete and consistent basis; no clear link to the current exposure.",
    inclSv: "Uppgiften är klarlagd och saknar konkret koppling till rollens exponering.",
    inclEn: "The information is clarified and has no concrete link to the role's exposure.",
    exclSv: "Ett tema där underlaget fortfarande är ofullständigt.",
    exclEn: "A theme where the basis is still incomplete.",
    suppSv: "Samstämmiga uppgifter från kandidaten och eventuell källa.",
    suppEn: "Consistent information from the candidate and any source.",
    counterSv: "Skyddsfaktorer och förändring sedan händelsen.",
    counterEn: "Protective factors and change since the event.",
    prohibited: ["suitability_inference"],
  },
  {
    state: "external_verification_needed",
    specRef: "§5.3 Arbetsstatus: verifiering krävs; Evidens: inte kontrollerad",
    nextAction: "external_verification",
    defSv: "Uppgiften behöver stödjas eller nyanseras av en källa.",
    defEn: "The information needs to be supported or qualified by a source.",
    inclSv: "Kandidaten har pekat ut en möjlig källa, eller en källa behövs.",
    inclEn: "The candidate has named a possible source, or a source is needed.",
    exclSv: "Registerkontroll och särskild personutredning – de ligger utanför produkten.",
    exclEn: "Register checks and special personnel investigations – they are outside the product.",
    suppSv: "Referens, dokument eller annan källa som kandidaten själv angett.",
    suppEn: "A referee, document or other source the candidate has named.",
    counterSv: "Kandidatens egen förklaring gäller tills källan har hörts.",
    counterEn: "The candidate's own explanation stands until the source has been heard.",
    prohibited: ["credibility_or_deception_inference", "suitability_inference"],
  },
  {
    state: "conflicting_information",
    specRef: "§5.3 Evidens: motsagd; §4.5 datumkonflikt",
    nextAction: "offer_candidate_correction",
    defSv: "Två uppgifter går inte ihop; båda visas ordagrant.",
    defEn: "Two pieces of information do not fit together; both are shown verbatim.",
    inclSv: "Olika tidpunkter eller uppgifter om samma sak.",
    inclEn: "Different dates or accounts of the same matter.",
    exclSv: "En skillnad som kandidaten redan har förklarat.",
    exclEn: "A difference the candidate has already explained.",
    suppSv: "Uppgifterna sida vid sida, med källa.",
    suppEn: "The pieces of information side by side, with their source.",
    counterSv: "En motsägelse är inte i sig tecken på oärlighet; kandidaten får alltid klargöra.",
    counterEn:
      "A contradiction is not in itself a sign of dishonesty; the candidate may always clarify.",
    prohibited: ["inconsistency_as_dishonesty", "credibility_or_deception_inference"],
  },
  {
    state: "insufficient_basis",
    specRef: "§5.3 ankare: Otillräckligt underlag",
    nextAction: "record_insufficient_basis",
    defSv: "Underlaget räcker inte utan ytterligare uppgifter.",
    defEn: "The basis is not enough without further information.",
    inclSv: "Det som behövs finns inte och kan inte fås fram i samtalet.",
    inclEn: "What is needed does not exist and cannot be obtained in the conversation.",
    exclSv:
      "Ett tema där kandidaten valt att inte svara, om det inte är en rollrelevant kärnfråga.",
    exclEn:
      "A theme the candidate chose not to answer, unless it is a role-relevant core question.",
    suppSv: "Vad som saknas och varför.",
    suppEn: "What is missing and why.",
    counterSv: "En lucka är aldrig negativ bevisning.",
    counterEn: "A gap is never negative evidence.",
    prohibited: ["omission_as_negative_evidence", "suitability_inference"],
  },
  {
    state: "not_applicable",
    specRef: "§5.2 steg 8 Rollsamband (härlett)",
    nextAction: "none",
    defSv: "Temat saknar koppling till den aktuella rollens exponering.",
    defEn: "The theme has no link to the current role's exposure.",
    inclSv: "Exponeringsprofilen omfattar inte det temat gäller.",
    inclEn: "The exposure profile does not cover what the theme concerns.",
    exclSv: "Ett tema där kopplingen är oklar – det behöver klargöras.",
    exclEn: "A theme where the link is unclear – it needs clarifying.",
    suppSv: "Exponeringsprofilen och rollbeskrivningen.",
    suppEn: "The exposure profile and the role description.",
    counterSv: "Uppgiften gäller den profil som låstes; rollens exponering kan ändras.",
    counterEn: "The role's exposure can change; this applies to the profile that was locked.",
    prohibited: ["suitability_inference"],
  },
];

/* ------------------------------------------------------------------ */
/* §5.3 — the observation, as the ten governed fields                  */
/* ------------------------------------------------------------------ */

export const OBSERVATION_FIELDS: ReadonlyArray<{
  key: string;
  ordinal: number;
  recordedBy: string;
  isJudgement: boolean;
  labelSv: string;
  labelEn: string;
  defSv: string;
  defEn: string;
  specFields: string;
}> = [
  {
    key: "fact",
    ordinal: 1,
    recordedBy: "interviewer",
    isJudgement: false,
    labelSv: "Konkret sakförhållande",
    labelEn: "Concrete fact",
    defSv: "Vad som faktiskt hände, antecknat före tolkning.",
    defEn: "What actually happened, recorded before interpretation.",
    specFields: "factual_summary, candidate_statement",
  },
  {
    key: "source_provenance",
    ordinal: 2,
    recordedBy: "interviewer",
    isJudgement: false,
    labelSv: "Källa och proveniens",
    labelEn: "Source and provenance",
    defSv:
      "Var uppgiften kommer ifrån: basfråga, kandidatens uppgift, befattningens exponering, tidigare dokumenterad uppgift eller intervjuarens följdfråga.",
    defEn:
      "Where the information comes from: base question, the candidate's statement, the role's exposure, earlier documented information or the interviewer's follow-up.",
    specFields: "source_type, source_reference",
  },
  {
    key: "role_exposure_link",
    ordinal: 3,
    recordedBy: "interviewer",
    isJudgement: false,
    labelSv: "Rollsamband",
    labelEn: "Link to the role",
    defSv: "Hur uppgiften konkret kopplas till den låsta exponeringsprofilen.",
    defEn: "How the information links concretely to the locked exposure profile.",
    specFields: "role_exposure_reference, role_relevance",
  },
  {
    key: "interviewer_interpretation",
    ordinal: 4,
    recordedBy: "interviewer",
    isJudgement: true,
    labelSv: "Intervjuarens tolkning",
    labelEn: "Interviewer's interpretation",
    defSv: "Intervjuarens egen tolkning, åtskild från sakförhållandet.",
    defEn: "The interviewer's own interpretation, kept apart from the fact.",
    specFields: "(tolkning i FAKTA-kedjan)",
  },
  {
    key: "candidate_explanation",
    ordinal: 5,
    recordedBy: "candidate",
    isJudgement: false,
    labelSv: "Kandidatens förklaring",
    labelEn: "Candidate's explanation",
    defSv: "Hur kandidaten själv förklarar händelsen, markerad som kandidatens ord.",
    defEn: "How the candidate explains the event, marked as the candidate's words.",
    specFields: "candidate_explanation",
  },
  {
    key: "counter_evidence",
    ordinal: 6,
    recordedBy: "interviewer",
    isJudgement: false,
    labelSv: "Stödjande och motsägande information",
    labelEn: "Corroborating and contradicting information",
    defSv: "Vad som talar för och emot att uppgiften är en aktuell sårbarhet.",
    defEn: "What speaks for and against the information being a current vulnerability.",
    specFields: "corroborating_information, contradicting_information",
  },
  {
    key: "protective_factor",
    ordinal: 7,
    recordedBy: "interviewer",
    isJudgement: false,
    labelSv: "Skyddsfaktor och åtgärd",
    labelEn: "Protective factor and measure",
    defSv: "Stöd, kontroll eller förändrat beteende som minskar relevansen.",
    defEn: "Support, control or changed behaviour that reduces relevance.",
    specFields: "protective_factors, mitigation_status",
  },
  {
    key: "verification_need",
    ordinal: 8,
    recordedBy: "interviewer",
    isJudgement: false,
    labelSv: "Verifiering och kvarstående lucka",
    labelEn: "Verification and remaining gap",
    defSv: "Vilken källa som kan stödja eller motsäga uppgiften, och vad som återstår.",
    defEn: "Which source can support or contradict the information, and what remains.",
    specFields: "verification_status, uncertainty, follow_up_action",
  },
  {
    key: "candidate_correction",
    ordinal: 9,
    recordedBy: "candidate",
    isJudgement: false,
    labelSv: "Kandidatens rättelse",
    labelEn: "Candidate's correction",
    defSv: "Rättelse eller komplettering efter återläsning.",
    defEn: "Correction or addition after read-back.",
    specFields: "candidate_has_reviewed_facts",
  },
  {
    key: "sensitivity_access_class",
    ordinal: 10,
    recordedBy: "system",
    isJudgement: false,
    labelSv: "Känslighets- och åtkomstklass",
    labelEn: "Sensitivity and access class",
    defSv: "Vem som får läsa observationen.",
    defEn: "Who may read the observation.",
    specFields: "(behörighetsstyrning, §7)",
  },
];

/* ------------------------------------------------------------------ */
/* Security vetting only: the three activation requirements            */
/* ------------------------------------------------------------------ */

export const ACTIVATION_REQUIREMENTS = [
  {
    key: "security_sensitive_role_attested",
    by: "authorised_security_function",
    sv: "Befattningen är dokumenterat säkerhetskänslig enligt verksamhetsutövarens befattningsanalys (säkerhetsskyddslagen 3 kap., PMFS 2026:8 6 kap.).",
    en: "The position is documented as security-sensitive in the operator's position analysis (Protective Security Act ch. 3, PMFS 2026:8 ch. 6).",
  },
  {
    key: "lawful_basis_recorded",
    by: "accountable_process_owner",
    sv: "Rättslig grund för behandlingen är fastställd och dokumenterad per fält, inklusive eventuell artikel 9/10-grund.",
    en: "The lawful basis for processing is established and documented per field, including any Article 9/10 basis.",
  },
  {
    key: "authorised_security_owner_assigned",
    by: "authorised_security_function",
    sv: "En behörig säkerhetsskyddsansvarig är utsedd och gör det mänskliga ställningstagandet.",
    en: "An authorised security officer is appointed and makes the human determination.",
  },
] as const;

/* ------------------------------------------------------------------ */
/* Where the specification's own wording had to change                 */
/* ------------------------------------------------------------------ */
//
// The database's content check (beskt_text_instructs_scoring) refuses
// judgement vocabulary even inside a denial. Two source-stated sentences hit
// it. They were reworded with the same meaning; the reviewers decide whether
// the rewording is acceptable.

export const WORDING_ADAPTATIONS: ReadonlyArray<{
  readonly where: string;
  readonly specText: string;
  readonly imported: string;
  readonly reason: string;
}> = [
  {
    where: "§4.3 fråga 15 (item q15_alkohol_droger_spel)",
    specText: "… ekonomisk konsekvens eller nedsatt omdöme?",
    imported: "… ekonomisk konsekvens eller försämrad förmåga att fatta beslut?",
    reason: "”omdöme” is refused as judgement vocabulary by the content check.",
  },
  {
    where: "§5.3 ankare ”Otillräckligt underlag” (evidence anchor insufficient_basis)",
    specText: "Bedömning kan inte göras utan ytterligare uppgifter.",
    imported: "Underlaget räcker inte utan ytterligare uppgifter.",
    reason: "”bedömning” is refused as judgement vocabulary by the content check.",
  },
];
