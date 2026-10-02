import type { Market, MaturityLevel, SecurityDomainId, Text } from "../types";

/**
 * Security Baseline content, version 1. Repository-managed and versioned:
 * an assessment records the content version and market it was answered
 * against, so changing a question here never rewrites an old assessment.
 *
 * Levels: the level a "yes" contributes to. 2 = Managed, 3 = Measured,
 * 4 = Optimised. Level 1 (Informal) is the floor and has no questions.
 * Quick questions are the 15-minute set. Market "se" questions are the
 * Swedish pack and only appear for assessments with market "se".
 */
export const BASELINE_VERSION = "baseline-v1";

export type BaselineQuestion = {
  id: string;
  domain: SecurityDomainId;
  level: 2 | 3 | 4;
  quick: boolean;
  markets: Market[];
  text: Text;
  why: Text;
  evidence: Text;
};

export const SECURITY_DOMAINS: { id: SecurityDomainId; title: Text; summary: Text }[] = [
  {
    id: "governance",
    title: { sv: "Styrning & organisation", en: "Governance & organisation" },
    summary: {
      sv: "Uppdrag, ansvar, policy och ledningens engagemang.",
      en: "Mandate, responsibilities, policy and management commitment.",
    },
  },
  {
    id: "personnel",
    title: { sv: "Personalsäkerhet", en: "Personnel security" },
    summary: {
      sv: "Bakgrundskontroll, behörigheter, avslut och insiderrisk.",
      en: "Background checks, access rights, leavers and insider risk.",
    },
  },
  {
    id: "physical",
    title: { sv: "Fysisk säkerhet", en: "Physical security" },
    summary: {
      sv: "Tillträde, skalskydd, larm och bevakning.",
      en: "Access control, perimeter protection, alarms and guarding.",
    },
  },
  {
    id: "information_cyber",
    title: { sv: "Information & cybersamordning", en: "Information & cyber coordination" },
    summary: {
      sv: "Informationsklassning och samordning av krav med IT/CISO.",
      en: "Information classification and coordinating requirements with IT/CISO.",
    },
  },
  {
    id: "incident",
    title: { sv: "Incidenthantering", en: "Incident management" },
    summary: {
      sv: "Rapportering, hantering och lärande av incidenter.",
      en: "Reporting, handling and learning from incidents.",
    },
  },
  {
    id: "continuity",
    title: { sv: "Kris & kontinuitet", en: "Crisis & business continuity" },
    summary: {
      sv: "Krisorganisation, kontinuitetsplaner och övning.",
      en: "Crisis organisation, continuity plans and exercises.",
    },
  },
  {
    id: "suppliers",
    title: { sv: "Leverantörer & tredje part", en: "Suppliers & third parties" },
    summary: {
      sv: "Säkerhetskrav i avtal och uppföljning av leverantörer.",
      en: "Security requirements in contracts and supplier follow-up.",
    },
  },
  {
    id: "travel_events",
    title: { sv: "Resor, evenemang & personskydd", en: "Travel, events & executive protection" },
    summary: {
      sv: "Resesäkerhet, evenemang och skydd av utsatta personer.",
      en: "Travel security, events and protection of exposed people.",
    },
  },
  {
    id: "culture_training",
    title: { sv: "Säkerhetskultur & utbildning", en: "Security culture & training" },
    summary: {
      sv: "Medvetenhet, utbildning och hur säkerhet upplevs i vardagen.",
      en: "Awareness, training and how security is experienced day to day.",
    },
  },
  {
    id: "compliance",
    title: { sv: "Regelefterlevnad & krav", en: "Compliance & requirements" },
    summary: {
      sv: "Lagkrav, kundkrav och hur de följs upp.",
      en: "Legal requirements, customer requirements and how they are followed up.",
    },
  },
];

const q = (
  id: string,
  domain: SecurityDomainId,
  level: 2 | 3 | 4,
  quick: boolean,
  text: [string, string],
  why: [string, string],
  evidence: [string, string],
  markets: Market[] = ["global", "se"],
): BaselineQuestion => ({
  id,
  domain,
  level,
  quick,
  markets,
  text: { sv: text[0], en: text[1] },
  why: { sv: why[0], en: why[1] },
  evidence: { sv: evidence[0], en: evidence[1] },
});

export const BASELINE_QUESTIONS: BaselineQuestion[] = [
  // ── Governance & organisation ───────────────────────────────────────────
  q(
    "gov.mandate",
    "governance",
    2,
    true,
    [
      "Finns ett beslutat uppdrag för säkerhetsfunktionen med tydligt ansvar och rapporteringsväg?",
      "Is there an agreed mandate for the security function with clear responsibility and reporting line?",
    ],
    [
      "Utan mandat blir säkerhetsarbetet personberoende och svårt att prioritera.",
      "Without a mandate, security work depends on individuals and is hard to prioritise.",
    ],
    [
      "Beslut från ledning, befattningsbeskrivning, organisationsschema.",
      "Management decision, role description, organisation chart.",
    ],
  ),
  q(
    "gov.policy",
    "governance",
    2,
    true,
    [
      "Finns en beslutad säkerhetspolicy som är känd i organisationen?",
      "Is there an approved security policy that the organisation knows about?",
    ],
    [
      "Policyn är grunden för krav på medarbetare, chefer och leverantörer.",
      "The policy is the basis for requirements on staff, managers and suppliers.",
    ],
    [
      "Policydokument med beslutsdatum, intranätsida, introduktionsmaterial.",
      "Policy document with decision date, intranet page, onboarding material.",
    ],
  ),
  q(
    "gov.risk-acceptance",
    "governance",
    2,
    true,
    [
      "Är det bestämt vem som får acceptera risk och på vilka nivåer?",
      "Is it decided who may accept risk, and at which levels?",
    ],
    [
      "Riskacceptans är ett ledningsbeslut. Oklarhet leder till att ingen äger risken.",
      "Risk acceptance is a management decision. Ambiguity means nobody owns the risk.",
    ],
    ["Delegationsordning, riskpolicy, protokoll.", "Delegation scheme, risk policy, minutes."],
  ),
  q(
    "gov.review",
    "governance",
    3,
    true,
    [
      "Rapporteras säkerhetsläget till ledningen regelbundet och följs beslut upp?",
      "Is the security position reported to management regularly, with decisions followed up?",
    ],
    [
      "Regelbunden rapportering gör säkerhet till en ledningsfråga och inte en händelsefråga.",
      "Regular reporting makes security a management matter, not an incident matter.",
    ],
    [
      "Ledningsrapporter, mötesprotokoll, beslutslogg.",
      "Management reports, meeting minutes, decision log.",
    ],
  ),
  q(
    "gov.roles",
    "governance",
    2,
    false,
    [
      "Är säkerhetsansvar för chefer och nyckelroller dokumenterat?",
      "Are security responsibilities for managers and key roles documented?",
    ],
    [
      "Linjechefer äger säkerheten i sin verksamhet; det måste vara uttalat.",
      "Line managers own security in their operations; that must be explicit.",
    ],
    [
      "Ansvarsbeskrivningar, policybilaga, chefsintroduktion.",
      "Responsibility descriptions, policy annex, manager onboarding.",
    ],
  ),
  q(
    "gov.budget",
    "governance",
    3,
    false,
    [
      "Finns en planerad budget och årsplan för säkerhetsarbetet?",
      "Is there a planned budget and annual plan for security work?",
    ],
    [
      "Planerade resurser gör det möjligt att prioritera i stället för att släcka bränder.",
      "Planned resources make prioritisation possible instead of fire-fighting.",
    ],
    ["Verksamhetsplan, budgetunderlag.", "Business plan, budget basis."],
  ),
  q(
    "gov.improve",
    "governance",
    4,
    false,
    [
      "Utvärderas säkerhetsprogrammet årligen och justeras utifrån resultat och omvärld?",
      "Is the security programme evaluated annually and adjusted on results and external developments?",
    ],
    [
      "Ett program som inte utvärderas stagnerar och tappar relevans.",
      "A programme that is not evaluated stagnates and loses relevance.",
    ],
    [
      "Årlig utvärdering, revisionsrapport, förbättringslogg.",
      "Annual evaluation, audit report, improvement log.",
    ],
  ),

  // ── Personnel security ──────────────────────────────────────────────────
  q(
    "per.screening",
    "personnel",
    2,
    true,
    [
      "Görs bakgrundskontroll anpassad till rollens känslighet innan anställning?",
      "Are background checks, proportionate to the role, done before employment?",
    ],
    [
      "Fel person på en känslig roll är en av de svåraste riskerna att hantera i efterhand.",
      "The wrong person in a sensitive role is one of the hardest risks to manage afterwards.",
    ],
    [
      "Rekryteringsrutin, checklista, kontrollnivåer per roll.",
      "Recruitment procedure, checklist, check levels per role.",
    ],
  ),
  q(
    "per.access",
    "personnel",
    2,
    true,
    [
      "Finns en rutin för att tilldela och ta bort behörigheter när någon börjar, byter roll eller slutar?",
      "Is there a procedure to grant and remove access when someone joins, changes role or leaves?",
    ],
    [
      "Kvarvarande behörigheter är en vanlig orsak till incidenter.",
      "Lingering access is a common cause of incidents.",
    ],
    [
      "On-/offboardingrutin, behörighetslogg, HR-checklista.",
      "Joiner/leaver procedure, access log, HR checklist.",
    ],
  ),
  q(
    "per.insider",
    "personnel",
    3,
    true,
    [
      "Hanteras insiderrisk strukturerat, till exempel genom samtal, signaler och stöd till chefer?",
      "Is insider risk handled in a structured way, for example through conversations, signals and manager support?",
    ],
    [
      "De flesta insiderhändelser föregås av signaler som ingen tog hand om.",
      "Most insider events are preceded by signals nobody acted on.",
    ],
    [
      "Rutin för oroande beteende, chefsstöd, samverkan med HR.",
      "Procedure for concerning behaviour, manager support, HR cooperation.",
    ],
  ),
  q(
    "per.review",
    "personnel",
    3,
    false,
    [
      "Granskas behörigheter till känsliga system och lokaler regelbundet?",
      "Are access rights to sensitive systems and premises reviewed regularly?",
    ],
    [
      "Behörigheter växer med tiden om ingen rensar.",
      "Access accumulates over time unless someone prunes it.",
    ],
    ["Behörighetsgranskning, kvartalsrapport.", "Access review, quarterly report."],
  ),
  q(
    "per.sensitive-roles",
    "personnel",
    2,
    false,
    [
      "Är känsliga roller identifierade med särskilda krav?",
      "Are sensitive roles identified with specific requirements?",
    ],
    [
      "Krav måste följa risken i rollen, inte vara lika för alla.",
      "Requirements should follow the risk of the role, not be the same for everyone.",
    ],
    ["Rollförteckning, kravmatris.", "Role register, requirement matrix."],
  ),
  q(
    "per.metrics",
    "personnel",
    4,
    false,
    [
      "Följs personalsäkerheten upp med mått och lärdomar som påverkar rutinerna?",
      "Is personnel security followed up with measures and lessons that change the procedures?",
    ],
    [
      "Mått visar om rutinerna fungerar i praktiken.",
      "Measures show whether procedures work in practice.",
    ],
    [
      "Uppföljningsrapport, förbättringar efter incident.",
      "Follow-up report, improvements after incidents.",
    ],
  ),

  // ── Physical security ───────────────────────────────────────────────────
  q(
    "phy.zones",
    "physical",
    2,
    true,
    [
      "Är lokaler indelade i zoner med tillträde efter behov?",
      "Are premises divided into zones with access on a need basis?",
    ],
    [
      "Zonindelning gör att skyddet kan koncentreras där det behövs.",
      "Zoning concentrates protection where it is needed.",
    ],
    [
      "Zonplan, tillträdesregler, passersystemets konfiguration.",
      "Zone plan, access rules, access-control configuration.",
    ],
  ),
  q(
    "phy.visitors",
    "physical",
    2,
    true,
    [
      "Hanteras besökare och entreprenörer kontrollerat (registrering, följeslagare, kort)?",
      "Are visitors and contractors handled in a controlled way (registration, escort, badges)?",
    ],
    [
      "Obevakade besökare är det enklaste sättet in i de flesta organisationer.",
      "Unescorted visitors are the easiest way into most organisations.",
    ],
    ["Besöksrutin, besöksloggar, kortrutin.", "Visitor procedure, visitor logs, badge procedure."],
  ),
  q(
    "phy.alarm",
    "physical",
    2,
    true,
    [
      "Finns fungerande larm och åtgärd vid larm för viktiga lokaler?",
      "Are there working alarms and a response for important premises?",
    ],
    ["Ett larm utan åtgärd ger falsk trygghet.", "An alarm with no response gives false security."],
    [
      "Larmavtal, åtgärdsinstruktion, testprotokoll.",
      "Alarm contract, response instruction, test records.",
    ],
  ),
  q(
    "phy.test",
    "physical",
    3,
    true,
    [
      "Testas och följs det fysiska skyddet upp regelbundet (ronder, larmtest, brister)?",
      "Is physical protection tested and followed up regularly (rounds, alarm tests, defects)?",
    ],
    [
      "Skydd som inte testas försämras obemärkt.",
      "Protection that is not tested degrades unnoticed.",
    ],
    [
      "Rondprotokoll, bristlista, åtgärdade avvikelser.",
      "Round records, defect list, resolved deviations.",
    ],
  ),
  q(
    "phy.keys",
    "physical",
    2,
    false,
    [
      "Hanteras nycklar och passerkort med register och återlämning?",
      "Are keys and access cards handled with a register and returns?",
    ],
    [
      "Okontrollerade nycklar underminerar allt annat skalskydd.",
      "Uncontrolled keys undermine every other perimeter control.",
    ],
    ["Nyckelregister, kortregister, kvittenser.", "Key register, card register, receipts."],
  ),
  q(
    "phy.risk-based",
    "physical",
    3,
    false,
    [
      "Bygger det fysiska skyddet på en dokumenterad bedömning av hot och skyddsvärden?",
      "Is physical protection based on a documented assessment of threats and protected assets?",
    ],
    [
      "Skydd utan bedömning blir antingen för dyrt eller fel placerat.",
      "Protection without assessment is either too expensive or misplaced.",
    ],
    [
      "Säkerhetsbedömning per anläggning, skyddsplan.",
      "Site security assessment, protection plan.",
    ],
  ),
  q(
    "phy.improve",
    "physical",
    4,
    false,
    [
      "Anpassas skyddet löpande efter incidenter, hotbild och verksamhetsförändringar?",
      "Is protection adjusted continuously after incidents, threat picture and business changes?",
    ],
    [
      "Hotbilden och verksamheten ändras; skyddet måste följa med.",
      "Threats and the business change; protection must keep pace.",
    ],
    ["Ändringslogg, beslut efter incident.", "Change log, decisions after incidents."],
  ),

  // ── Information & cyber coordination ────────────────────────────────────
  q(
    "inf.classification",
    "information_cyber",
    2,
    true,
    [
      "Finns en informationsklassning som medarbetare förstår och använder?",
      "Is there an information classification that staff understand and use?",
    ],
    [
      "Utan klassning vet ingen vad som ska skyddas hårdast.",
      "Without classification nobody knows what to protect most.",
    ],
    ["Klassningsmodell, märkning, utbildning.", "Classification model, labelling, training."],
  ),
  q(
    "inf.ciso",
    "information_cyber",
    2,
    true,
    [
      "Finns en etablerad samverkan mellan säkerhetsfunktionen och IT/CISO om krav och incidenter?",
      "Is there an established cooperation between the security function and IT/CISO on requirements and incidents?",
    ],
    [
      "Fysisk, personell och digital säkerhet hänger ihop; glappet mellan dem utnyttjas.",
      "Physical, personnel and digital security are connected; the gap between them gets exploited.",
    ],
    [
      "Möteskalender, gemensam incidentrutin, kravlista.",
      "Meeting cadence, joint incident procedure, requirement list.",
    ],
  ),
  q(
    "inf.handling",
    "information_cyber",
    2,
    true,
    [
      "Finns regler för hantering av känslig information (lagring, delning, utskrift, resor)?",
      "Are there rules for handling sensitive information (storage, sharing, printing, travel)?",
    ],
    [
      "Mest information läcker genom vardagliga misstag, inte avancerade angrepp.",
      "Most information leaks through everyday mistakes, not advanced attacks.",
    ],
    [
      "Hanteringsregler, clean desk-policy, reseinstruktion.",
      "Handling rules, clean-desk policy, travel instruction.",
    ],
  ),
  q(
    "inf.followup",
    "information_cyber",
    3,
    true,
    [
      "Följs säkerhetskrav mot IT upp och rapporteras avvikelser gemensamt?",
      "Are security requirements on IT followed up, with deviations reported jointly?",
    ],
    [
      "Krav som inte följs upp blir önskemål.",
      "Requirements that are not followed up become wishes.",
    ],
    ["Kravuppföljning, gemensam avvikelselista.", "Requirement follow-up, joint deviation list."],
  ),
  q(
    "inf.inventory",
    "information_cyber",
    3,
    false,
    [
      "Är de viktigaste informationstillgångarna och systemen identifierade med ägare?",
      "Are the most important information assets and systems identified with owners?",
    ],
    [
      "Ägarskap är förutsättningen för beslut om skydd.",
      "Ownership is the precondition for protection decisions.",
    ],
    ["Tillgångsförteckning, systemägarlista.", "Asset register, system owner list."],
  ),
  q(
    "inf.improve",
    "information_cyber",
    4,
    false,
    [
      "Utvecklas samordningen med IT utifrån incidenter, övningar och nya krav?",
      "Does the coordination with IT develop from incidents, exercises and new requirements?",
    ],
    [
      "Samordning som inte utvecklas tappar greppet när tekniken ändras.",
      "Coordination that does not develop loses its grip as technology changes.",
    ],
    ["Lärdomslogg, gemensamma övningar.", "Lessons log, joint exercises."],
  ),

  // ── Incident management ─────────────────────────────────────────────────
  q(
    "inc.report",
    "incident",
    2,
    true,
    [
      "Vet medarbetare hur och till vem de rapporterar en säkerhetsincident?",
      "Do staff know how and to whom to report a security incident?",
    ],
    [
      "Incidenter som inte rapporteras kan inte hanteras eller läras av.",
      "Incidents that are not reported cannot be handled or learned from.",
    ],
    [
      "Rapporteringskanal, intranätsida, introduktion.",
      "Reporting channel, intranet page, onboarding.",
    ],
  ),
  q(
    "inc.process",
    "incident",
    2,
    true,
    [
      "Finns en rutin för hur incidenter hanteras, eskaleras och dokumenteras?",
      "Is there a procedure for how incidents are handled, escalated and documented?",
    ],
    [
      "En rutin ger samma hantering oavsett vem som är på plats.",
      "A procedure gives the same handling regardless of who is present.",
    ],
    [
      "Incidentrutin, eskaleringslista, incidentlogg.",
      "Incident procedure, escalation list, incident log.",
    ],
  ),
  q(
    "inc.learn",
    "incident",
    3,
    true,
    [
      "Analyseras incidenter och leder de till åtgärder och lärdomar?",
      "Are incidents analysed and do they lead to actions and lessons?",
    ],
    [
      "Samma incident upprepas tills orsaken åtgärdas.",
      "The same incident repeats until the cause is addressed.",
    ],
    [
      "Incidentanalyser, åtgärdslista, trendrapport.",
      "Incident analyses, action list, trend report.",
    ],
  ),
  q(
    "inc.trend",
    "incident",
    4,
    true,
    [
      "Används incidentstatistik och trender för att prioritera säkerhetsarbetet?",
      "Are incident statistics and trends used to prioritise security work?",
    ],
    ["Trender visar var skyddet faktiskt brister.", "Trends show where protection actually fails."],
    [
      "Trendrapport till ledning, prioriteringsbeslut.",
      "Trend report to management, prioritisation decisions.",
    ],
  ),
  q(
    "inc.external",
    "incident",
    2,
    false,
    [
      "Är det klart när och hur polis, myndigheter eller kunder ska informeras om en incident?",
      "Is it clear when and how police, authorities or customers are informed of an incident?",
    ],
    [
      "Anmälningsplikter och avtalskrav har korta tidsfrister.",
      "Reporting duties and contractual requirements have short deadlines.",
    ],
    [
      "Kontaktlista, anmälningsrutin, avtalsbilagor.",
      "Contact list, notification procedure, contract annexes.",
    ],
  ),

  // ── Crisis & business continuity ────────────────────────────────────────
  q(
    "con.crisis-org",
    "continuity",
    2,
    true,
    [
      "Finns en utsedd krisorganisation med roller, kontaktvägar och mandat?",
      "Is there a designated crisis organisation with roles, contact routes and mandate?",
    ],
    [
      "I en kris finns ingen tid att bestämma vem som bestämmer.",
      "In a crisis there is no time to decide who decides.",
    ],
    ["Krisplan, larmlista, rollkort.", "Crisis plan, call list, role cards."],
  ),
  q(
    "con.critical",
    "continuity",
    2,
    true,
    [
      "Är de kritiska verksamheterna identifierade med acceptabel avbrottstid?",
      "Are critical operations identified with an acceptable downtime?",
    ],
    [
      "Prioritering i kris kräver att man vet vad som måste fungera först.",
      "Prioritising in a crisis requires knowing what must work first.",
    ],
    [
      "Konsekvensanalys, lista över kritiska processer.",
      "Impact analysis, list of critical processes.",
    ],
  ),
  q(
    "con.exercise",
    "continuity",
    3,
    true,
    [
      "Övas krisorganisationen regelbundet och åtgärdas lärdomarna?",
      "Is the crisis organisation exercised regularly, with lessons addressed?",
    ],
    [
      "En plan som inte övats fungerar sällan första gången.",
      "A plan that has not been exercised rarely works the first time.",
    ],
    ["Övningsrapport, åtgärdslista efter övning.", "Exercise report, post-exercise action list."],
  ),
  q(
    "con.plans",
    "continuity",
    3,
    false,
    [
      "Finns kontinuitetsplaner för de kritiska verksamheterna?",
      "Are there continuity plans for the critical operations?",
    ],
    [
      "Planen beskriver hur verksamheten fortsätter när något viktigt faller bort.",
      "The plan describes how operations continue when something important fails.",
    ],
    ["Kontinuitetsplaner, reservrutiner.", "Continuity plans, fallback procedures."],
  ),
  q(
    "con.improve",
    "continuity",
    4,
    false,
    [
      "Uppdateras krishantering och kontinuitet löpande efter övningar, händelser och förändringar?",
      "Are crisis management and continuity updated continuously after exercises, events and changes?",
    ],
    [
      "Planer åldras snabbt när organisationen förändras.",
      "Plans age quickly as the organisation changes.",
    ],
    ["Revisionshistorik, ändringslogg.", "Revision history, change log."],
  ),

  // ── Suppliers & third parties ───────────────────────────────────────────
  q(
    "sup.requirements",
    "suppliers",
    2,
    true,
    [
      "Ställs säkerhetskrav i avtal med leverantörer som har tillgång till lokaler, information eller system?",
      "Are security requirements placed in contracts with suppliers that access premises, information or systems?",
    ],
    [
      "Leverantörer ärver er risk men inte automatiskt era regler.",
      "Suppliers inherit your risk but not automatically your rules.",
    ],
    ["Avtalsbilaga säkerhet, kravmall.", "Security contract annex, requirement template."],
  ),
  q(
    "sup.critical",
    "suppliers",
    2,
    true,
    [
      "Är kritiska leverantörer identifierade med en ansvarig kontakt?",
      "Are critical suppliers identified with a responsible contact?",
    ],
    [
      "Ett avbrott hos en kritisk leverantör är ett avbrott hos er.",
      "A critical supplier's outage is your outage.",
    ],
    [
      "Leverantörsförteckning, kritikalitetsbedömning.",
      "Supplier register, criticality assessment.",
    ],
  ),
  q(
    "sup.followup",
    "suppliers",
    3,
    true,
    [
      "Följs kraven upp hos leverantörer, till exempel genom intyg, besök eller revision?",
      "Are the requirements followed up with suppliers, for example through attestations, visits or audits?",
    ],
    [
      "Krav i avtal betyder inget utan uppföljning.",
      "Contract requirements mean nothing without follow-up.",
    ],
    ["Uppföljningsplan, revisionsrapporter.", "Follow-up plan, audit reports."],
  ),
  q(
    "sup.onboarding",
    "suppliers",
    2,
    false,
    [
      "Får leverantörspersonal samma introduktion och regler som egna medarbetare?",
      "Do supplier staff receive the same onboarding and rules as your own employees?",
    ],
    [
      "Externa medarbetare är ofta den minst informerade gruppen.",
      "External staff are often the least informed group.",
    ],
    [
      "Introduktionsrutin för extern personal, kortrutin.",
      "Onboarding procedure for external staff, badge procedure.",
    ],
  ),
  q(
    "sup.improve",
    "suppliers",
    4,
    false,
    [
      "Används uppföljningens resultat för att förbättra krav och leverantörsval?",
      "Are follow-up results used to improve requirements and supplier selection?",
    ],
    [
      "Lärdomar från uppföljning ska påverka nästa upphandling.",
      "Lessons from follow-up should shape the next procurement.",
    ],
    [
      "Reviderade kravmallar, upphandlingsunderlag.",
      "Revised requirement templates, procurement basis.",
    ],
  ),

  // ── Travel, events & executive protection ───────────────────────────────
  q(
    "tra.travel",
    "travel_events",
    2,
    true,
    [
      "Finns regler och stöd för resor till länder eller platser med förhöjd risk?",
      "Are there rules and support for travel to countries or places with elevated risk?",
    ],
    [
      "Arbetsgivaren har ansvar för medarbetare på resa.",
      "The employer is responsible for travelling staff.",
    ],
    [
      "Resepolicy, riskklassning av länder, larmnummer.",
      "Travel policy, country risk rating, emergency number.",
    ],
  ),
  q(
    "tra.events",
    "travel_events",
    2,
    true,
    [
      "Görs en säkerhetsbedömning inför större evenemang och möten?",
      "Is a security assessment made before larger events and meetings?",
    ],
    [
      "Evenemang samlar personer, information och uppmärksamhet på en plats.",
      "Events gather people, information and attention in one place.",
    ],
    [
      "Evenemangschecklista, bedömningar, samverkan med arrangör.",
      "Event checklist, assessments, cooperation with organiser.",
    ],
  ),
  q(
    "tra.executives",
    "travel_events",
    3,
    true,
    [
      "Är utsatta personer (ledning, exponerade roller) identifierade och finns en plan för deras skydd?",
      "Are exposed people (executives, exposed roles) identified, with a plan for their protection?",
    ],
    [
      "Hot mot enskilda personer kräver förberedelse innan de uppstår.",
      "Threats to individuals require preparation before they arise.",
    ],
    [
      "Riskbedömning per person, skyddsplan, kontaktvägar.",
      "Per-person risk assessment, protection plan, contact routes.",
    ],
  ),
  q(
    "tra.improve",
    "travel_events",
    4,
    false,
    [
      "Följs rese- och evenemangssäkerheten upp och förbättras efter händelser?",
      "Are travel and event security followed up and improved after events?",
    ],
    [
      "Varje resa och evenemang ger lärdomar om rutinen fångar dem.",
      "Every trip and event yields lessons if the procedure captures them.",
    ],
    ["Uppföljningsrapporter, reviderade rutiner.", "Follow-up reports, revised procedures."],
  ),

  // ── Security culture & training ─────────────────────────────────────────
  q(
    "cul.onboarding",
    "culture_training",
    2,
    true,
    [
      "Får alla nya medarbetare en säkerhetsintroduktion?",
      "Do all new employees receive a security onboarding?",
    ],
    [
      "Första veckan formar hur säkerhet uppfattas.",
      "The first week shapes how security is perceived.",
    ],
    ["Introduktionsprogram, deltagarlistor.", "Onboarding programme, attendance lists."],
  ),
  q(
    "cul.training",
    "culture_training",
    2,
    true,
    [
      "Genomförs återkommande säkerhetsutbildning anpassad till roller?",
      "Is recurring security training delivered, adapted to roles?",
    ],
    [
      "Kunskap försvinner utan repetition och anpassning.",
      "Knowledge fades without repetition and relevance.",
    ],
    ["Utbildningsplan, genomförandestatistik.", "Training plan, completion statistics."],
  ),
  q(
    "cul.measure",
    "culture_training",
    3,
    true,
    [
      "Mäts säkerhetskulturen, till exempel genom enkäter, rapporteringsgrad eller tester?",
      "Is security culture measured, for example through surveys, reporting rate or tests?",
    ],
    ["Det som mäts går att förbättra.", "What is measured can be improved."],
    [
      "Enkätresultat, rapporteringsstatistik, testresultat.",
      "Survey results, reporting statistics, test results.",
    ],
  ),
  q(
    "cul.leaders",
    "culture_training",
    3,
    false,
    [
      "Föregår chefer med gott exempel och tar upp säkerhet i sina team?",
      "Do managers lead by example and raise security in their teams?",
    ],
    [
      "Medarbetare följer chefens beteende, inte policyn.",
      "Staff follow the manager's behaviour, not the policy.",
    ],
    [
      "Chefsmaterial, mötesagendor, ledningsbudskap.",
      "Manager material, meeting agendas, leadership messages.",
    ],
  ),
  q(
    "cul.improve",
    "culture_training",
    4,
    false,
    [
      "Anpassas utbildning och budskap utifrån mätningar och incidenter?",
      "Are training and messaging adapted based on measurements and incidents?",
    ],
    ["Samma utbildning varje år förlorar effekt.", "The same training every year loses effect."],
    [
      "Ändringar i utbildningsplan, effektuppföljning.",
      "Changes to the training plan, effect follow-up.",
    ],
  ),

  // ── Compliance & requirements ───────────────────────────────────────────
  q(
    "com.inventory",
    "compliance",
    2,
    true,
    [
      "Är de lagar, myndighetskrav och kundkrav som påverkar säkerhetsarbetet identifierade?",
      "Are the laws, regulatory requirements and customer requirements that affect security work identified?",
    ],
    [
      "Krav man inte känner till kan inte efterlevas.",
      "Requirements you do not know about cannot be met.",
    ],
    ["Kravförteckning, avtalsgenomgång.", "Requirement register, contract review."],
  ),
  q(
    "com.owner",
    "compliance",
    2,
    true,
    [
      "Har varje krav en ansvarig som följer upp efterlevnaden?",
      "Does every requirement have an owner who follows up compliance?",
    ],
    [
      "Krav utan ägare följs upp av ingen.",
      "Requirements without an owner are followed up by nobody.",
    ],
    [
      "Kravförteckning med ansvarig, uppföljningsplan.",
      "Requirement register with owner, follow-up plan.",
    ],
  ),
  q(
    "com.evidence",
    "compliance",
    3,
    true,
    [
      "Kan ni visa efterlevnad med dokumenterat underlag när en kund eller myndighet frågar?",
      "Can you show compliance with documented evidence when a customer or authority asks?",
    ],
    [
      "Efterlevnad som inte kan visas räknas inte.",
      "Compliance that cannot be shown does not count.",
    ],
    ["Revisionsunderlag, intyg, protokoll.", "Audit evidence, attestations, records."],
  ),
  q(
    "com.change",
    "compliance",
    4,
    false,
    [
      "Bevakas förändringar i krav och omsätts de i uppdaterade rutiner?",
      "Are changes in requirements monitored and turned into updated procedures?",
    ],
    [
      "Krav ändras; rutiner som inte följer med blir avvikelser.",
      "Requirements change; procedures that do not keep up become deviations.",
    ],
    ["Bevakningslogg, ändringsbeslut.", "Monitoring log, change decisions."],
  ),
  // Swedish pack
  q(
    "com.se.security-protection",
    "compliance",
    2,
    true,
    [
      "Har ni bedömt om verksamheten omfattas av säkerhetsskyddslagen och i så fall gjort en säkerhetsskyddsanalys?",
      "Have you assessed whether the organisation falls under the Swedish Protective Security Act and, if so, completed a protective security analysis?",
    ],
    [
      "Verksamheter av betydelse för Sveriges säkerhet har särskilda skyldigheter.",
      "Organisations of importance to Sweden's security have specific obligations.",
    ],
    [
      "Bedömning, säkerhetsskyddsanalys, kontakt med tillsynsmyndighet.",
      "Assessment, protective security analysis, contact with the supervisory authority.",
    ],
    ["se"],
  ),
  q(
    "com.se.camera-gdpr",
    "compliance",
    2,
    false,
    [
      "Hanteras kamerabevakning och personuppgifter i säkerhetsarbetet enligt kamerabevakningslagen och GDPR?",
      "Are camera surveillance and personal data in security work handled under the Swedish Camera Surveillance Act and GDPR?",
    ],
    [
      "Bevakning och register innehåller personuppgifter med särskilda krav.",
      "Surveillance and registers contain personal data with specific requirements.",
    ],
    [
      "Intresseavvägning, skyltning, registerförteckning.",
      "Balancing-of-interests assessment, signage, record of processing.",
    ],
    ["se"],
  ),
  q(
    "com.se.incident-duty",
    "compliance",
    3,
    false,
    [
      "Känner ni till och uppfyller rapporteringsskyldigheter till myndigheter vid allvarliga incidenter (till exempel MSB, IMY, Säkerhetspolisen)?",
      "Do you know and meet reporting duties to authorities for serious incidents (for example MSB, IMY, the Swedish Security Service)?",
    ],
    [
      "Rapporteringsplikter har korta tidsfrister och gäller olika beroende på verksamhet.",
      "Reporting duties have short deadlines and differ by sector.",
    ],
    [
      "Anmälningsrutin, kontaktlista, tidigare anmälningar.",
      "Notification procedure, contact list, previous notifications.",
    ],
    ["se"],
  ),
];

export function baselineQuestions(market: Market): BaselineQuestion[] {
  return BASELINE_QUESTIONS.filter((question) => question.markets.includes(market));
}
export function domainTitle(id: SecurityDomainId): Text {
  return SECURITY_DOMAINS.find((domain) => domain.id === id)?.title ?? { sv: id, en: id };
}
export const MATURITY_LEVELS: { level: MaturityLevel; title: Text; summary: Text }[] = [
  {
    level: 1,
    title: { sv: "Informellt", en: "Informal" },
    summary: {
      sv: "Säkerhetsarbetet bygger på enskilda personer och tillfälliga lösningar.",
      en: "Security work depends on individuals and ad hoc solutions.",
    },
  },
  {
    level: 2,
    title: { sv: "Styrt", en: "Managed" },
    summary: {
      sv: "Grundläggande rutiner, ansvar och regler finns och är beslutade.",
      en: "Basic procedures, responsibilities and rules exist and are agreed.",
    },
  },
  {
    level: 3,
    title: { sv: "Uppföljt", en: "Measured" },
    summary: {
      sv: "Arbetet följs upp, mäts och rapporteras regelbundet.",
      en: "The work is followed up, measured and reported regularly.",
    },
  },
  {
    level: 4,
    title: { sv: "Optimerat", en: "Optimised" },
    summary: {
      sv: "Arbetet förbättras löpande utifrån resultat, incidenter och omvärld.",
      en: "The work improves continuously from results, incidents and external developments.",
    },
  },
];
