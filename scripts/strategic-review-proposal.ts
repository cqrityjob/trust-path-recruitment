/**
 * Renders the strategic-level review proposal from the content migration as
 * replayed in a local database: every competency, section, item, option,
 * score and rationale, every rubric, and the interview guide -- so the
 * document reviewers read is generated from the rows they will approve,
 * never a second hand-written copy that could drift.
 *
 * Reads only. Refuses a non-loopback database.
 *
 *   JOURNEY_DATABASE_URL=postgresql://postgres:localbeskt@127.0.0.1:5432/beskt_e2e \
 *   bun run scripts/strategic-review-proposal.ts > docs/assessment/security-manager-recruitment-review-proposal.md
 */
import { execFileSync } from "node:child_process";

const DB = process.env.JOURNEY_DATABASE_URL ?? "";
if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/\w+$/.test(DB)) {
  console.error("JOURNEY_DATABASE_URL must be a loopback database.");
  process.exit(2);
}
function rows<T>(query: string): T[] {
  const out = execFileSync(
    "psql",
    [
      DB,
      "-tAq",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `SELECT coalesce(json_agg(q), '[]') FROM (${query}) q`,
    ],
    { encoding: "utf8" },
  ).trim();
  return JSON.parse(out) as T[];
}

type Item = {
  order: number;
  block: string;
  slug: string;
  format: string;
  competency: string;
  competency_sv: string;
  facet: string | null;
  behaviour: string;
  evidence: string;
  difficulty: string;
  demand: string;
  tests_what: string;
  observable: string;
  guard: string;
  scenario_sv: string;
  prompt_sv: string;
  scenario_en: string;
  prompt_en: string;
  options: Array<{
    key: string;
    score: number;
    preferred: boolean;
    reverse: boolean;
    error: string | null;
    rationale: string | null;
    sv: string;
    en: string;
  }> | null;
};

const def = rows<{
  name_sv: string;
  name_en: string;
  purpose_sv: string;
  purpose_en: string;
  dnm_sv: string[];
  dnm_en: string[];
  content_status: string;
  validation_status: string;
  standard: boolean;
}>(`
  SELECT d.name_sv, d.name_en, pv.purpose_sv, pv.purpose_en, pv.does_not_measure_sv dnm_sv, pv.does_not_measure_en dnm_en,
         av.content_status, av.validation_status, d.standard_for_recruitment standard
    FROM scp_assessment_definitions d
    JOIN scp_assessment_versions av ON av.definition_id = d.id AND av.version_number = 1
    JOIN scp_program_versions pv ON pv.id = av.program_version_id
   WHERE d.slug = 'security-manager-recruitment'`)[0]!;

const behaviours = rows<{
  slug: string;
  code: string;
  name_sv: string;
  statement_sv: string;
  statement_en: string;
  pos: string[];
  contra: string[];
}>(`
  SELECT b.slug, c.code, cv.name_sv, bv.statement_sv, bv.statement_en, bv.positive_indicators_sv pos, bv.contraindications_sv contra
    FROM scp_observable_behaviours b
    JOIN scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
    JOIN scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN scp_competency_versions cv ON cv.id = m.competency_version_id
    JOIN scp_competencies c ON c.id = cv.competency_id
   WHERE b.slug IN ('risk_based_prioritisation','governance_and_mandate','incident_and_crisis_leadership',
                    'cross_functional_collaboration','compliance_and_follow_up','people_leadership')
   ORDER BY array_position(ARRAY['risk_based_prioritisation','governance_and_mandate','incident_and_crisis_leadership',
                    'cross_functional_collaboration','compliance_and_follow_up','people_leadership'], b.slug)`);

const blocks = rows<{
  block_key: string;
  name_sv: string;
  name_en: string;
  intro_sv: string;
  intro_en: string;
  asks: string;
}>(`
  SELECT b.block_key, b.name_sv, b.name_en, b.intro_sv, b.intro_en, b.asks
    FROM scp_form_blocks b JOIN scp_forms f ON f.id = b.form_id
   WHERE f.slug = 'security-manager-recruitment-form-a' ORDER BY b.display_order`);

const items = rows<Item>(`
  SELECT fi.display_order "order", fi.block_key block, i.slug, iv.item_format format,
         c.code competency, (SELECT cv.name_sv FROM scp_competency_versions cv WHERE cv.competency_id = c.id ORDER BY cv.version_number LIMIT 1) competency_sv, fa.slug facet, ob.slug behaviour,
         iv.evidence_source_type evidence, iv.difficulty, iv.cognitive_demand demand, iv.tests_what,
         iv.observable_behavior observable, iv.overgeneralisation_guard_sv guard,
         tsv.scenario scenario_sv, tsv.prompt prompt_sv, ten.scenario scenario_en, ten.prompt prompt_en,
         (SELECT json_agg(json_build_object('key', o.option_key, 'score', o.score_value, 'preferred', o.is_preferred,
                   'reverse', o.reverse_scored, 'error', o.distractor_error_type, 'rationale', o.scoring_rationale_sv,
                   'sv', (SELECT label FROM scp_item_option_texts x WHERE x.item_option_id = o.id AND x.language = 'sv-SE'),
                   'en', (SELECT label FROM scp_item_option_texts x WHERE x.item_option_id = o.id AND x.language = 'en-GB'))
                 ORDER BY o.display_order)
            FROM scp_item_options o WHERE o.item_version_id = iv.id) options
    FROM scp_form_items fi
    JOIN scp_forms f ON f.id = fi.form_id
    JOIN scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN scp_items i ON i.id = iv.item_id
    JOIN scp_competencies c ON c.id = iv.competency_id
    LEFT JOIN scp_competency_facets fa ON fa.id = iv.facet_id
    JOIN scp_behaviour_versions bv ON bv.id = iv.primary_behaviour_id
    JOIN scp_observable_behaviours ob ON ob.id = bv.behaviour_id
    JOIN scp_item_texts tsv ON tsv.item_version_id = iv.id AND tsv.language = 'sv-SE'
    JOIN scp_item_texts ten ON ten.item_version_id = iv.id AND ten.language = 'en-GB'
   WHERE f.slug = 'security-manager-recruitment-form-a' ORDER BY fi.display_order`);

const rubrics = rows<{
  item: string;
  name_sv: string;
  name_en: string;
  must_not_infer: string[];
  dims: Array<{
    key: string;
    name_sv: string;
    name_en: string;
    criteria_sv: string;
    criteria_en: string;
    writing: boolean;
  }>;
}>(`
  SELECT i.slug item, rv.name_sv, rv.name_en, rv.must_not_infer,
         (SELECT json_agg(json_build_object('key', d.dimension_key, 'name_sv', d.name_sv, 'name_en', d.name_en,
                 'criteria_sv', d.observable_criteria_sv, 'criteria_en', d.observable_criteria_en, 'writing', d.assesses_writing_quality)
                 ORDER BY d.display_order) FROM scp_rubric_dimensions d WHERE d.rubric_version_id = rv.id) dims
    FROM scp_rubric_versions rv JOIN scp_rubrics r ON r.id = rv.rubric_id
    JOIN scp_item_versions iv ON iv.id = rv.item_version_id JOIN scp_items i ON i.id = iv.item_id
   WHERE r.slug LIKE 'sm-rj-e0%' ORDER BY i.slug`);

const levels = rows<{ level: number; sv: string; en: string }>(`
  SELECT DISTINCT l.level, l.descriptor_sv sv, l.descriptor_en en
    FROM scp_rubric_levels l JOIN scp_rubric_dimensions d ON d.id = l.rubric_dimension_id
    JOIN scp_rubric_versions rv ON rv.id = d.rubric_version_id JOIN scp_rubrics r ON r.id = rv.rubric_id
   WHERE r.slug LIKE 'sm-rj-e0%' ORDER BY l.level`);

const pack = rows<{
  name_sv: string;
  purpose_sv: string;
  content_status: string;
  validation_label: string;
  pilot_availability: string;
  summary_sv: string;
  content_hash: string;
}>(`
  SELECT p.name_sv, p.purpose_sv, v.content_status, v.validation_label, v.pilot_availability, v.summary_sv, v.content_hash
    FROM scp_interview_packs p JOIN scp_interview_pack_versions v ON v.pack_id = p.id AND v.version_number = 1
   WHERE p.slug = 'security-manager-se'`)[0]!;
const packComps = rows<{
  code: string;
  name_sv: string;
  definition_sv: string;
  indicators: string[];
  maps: string[];
}>(`
  SELECT c.code, c.name_sv, c.definition_sv, c.observable_indicators_sv indicators,
         (SELECT array_agg(sc.code || ' (' || m.relation || ', ' || m.mapping_state || ')' ORDER BY sc.code)
            FROM scp_interview_pack_competency_map m JOIN scp_competency_versions cv ON cv.id = m.competency_version_id
            JOIN scp_competencies sc ON sc.id = cv.competency_id WHERE m.pack_competency_id = c.id) maps
    FROM scp_interview_pack_competencies c JOIN scp_interview_pack_versions v ON v.id = c.pack_version_id
    JOIN scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se' ORDER BY c.display_order`);
const questions = rows<{
  code: string;
  question_type: string;
  prompt_sv: string;
  comps: string[];
  probes: string[];
  dims: string[];
  anchors: Array<{ level: number; label: string; anchor: string }>;
}>(`
  SELECT q.code, q.question_type, q.prompt_sv,
         (SELECT array_agg(c.code || CASE WHEN qc.is_primary THEN ' (primär)' ELSE '' END ORDER BY c.display_order)
            FROM scp_interview_question_competencies qc JOIN scp_interview_pack_competencies c ON c.id = qc.pack_competency_id WHERE qc.question_id = q.id) comps,
         (SELECT array_agg(pr.purpose || ': ' || pr.wording_sv ORDER BY pr.display_order) FROM scp_interview_approved_probes pr WHERE pr.question_id = q.id) probes,
         (SELECT array_agg(e.label_sv ORDER BY e.display_order) FROM scp_interview_evidence_dimensions e WHERE e.question_id = q.id) dims,
         (SELECT json_agg(json_build_object('level', a.level, 'label', a.label_sv, 'anchor', a.anchor_sv) ORDER BY a.level) FROM scp_interview_rating_anchors a WHERE a.question_id = q.id) anchors
    FROM scp_interview_core_questions q JOIN scp_interview_pack_versions v ON v.id = q.pack_version_id
    JOIN scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se' ORDER BY q.display_order`);
const generalProbes = rows<{ purpose: string; wording_sv: string }>(`
  SELECT pr.purpose, pr.wording_sv FROM scp_interview_approved_probes pr JOIN scp_interview_pack_versions v ON v.id = pr.pack_version_id
    JOIN scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se' AND pr.question_id IS NULL ORDER BY pr.display_order`);
const rules = rows<{
  code: string;
  requirement_sv: string;
  states: string[];
  action: string;
  subsequent: string;
  boundary: string;
}>(`
  SELECT r.code, r.requirement_sv, r.permitted_source_states states, r.interview_action_sv action, r.subsequent_verification_sv subsequent, r.passport_boundary_sv boundary
    FROM scp_interview_verification_rules r JOIN scp_interview_pack_versions v ON v.id = r.pack_version_id
    JOIN scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se' ORDER BY r.display_order`);
const prohibited = rows<{ area_type: string; code: string; statement_sv: string }>(`
  SELECT a.area_type, a.code, a.statement_sv FROM scp_interview_prohibited_areas a JOIN scp_interview_pack_versions v ON v.id = a.pack_version_id
    JOIN scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se' ORDER BY a.display_order`);
const prompts = rows<{
  code: string;
  facet: string;
  question_sv: string;
  followup_sv: string;
  listen: string[];
}>(`
  SELECT c.code, f.slug facet, p.question_sv, p.followup_sv, p.listen_for_sv listen
    FROM scp_interview_guide_prompts p JOIN scp_competencies c ON c.id = p.competency_id JOIN scp_competency_facets f ON f.id = p.facet_id
   WHERE p.focus = 'explore_self_report' AND p.authored_by_ai
     AND f.slug IN ('sparbar-uppfoljning','agarskap','aktivt-lyssnande','saklig-tydlighet','transparens','motstand-mot-otillborlig-paverkan','informationsdelning','faktabaserad-bedomning')
   ORDER BY c.code, f.slug`);
const gates = rows<{ n: number }>(`
  SELECT count(*)::int n FROM scp_review_requirements rr JOIN scp_item_versions iv ON iv.id = rr.item_version_id
    JOIN scp_items i ON i.id = iv.item_id WHERE i.slug LIKE 'sm-rj-%' AND rr.status = 'outstanding'`)[0]!
  .n;

const out: string[] = [];
const p = (s = "") => out.push(s);
p("# Granskningsförslag: TRUST – strategiska och ledande roller (Säkerhetschef)");
p();
p(
  "> **UTKAST FÖR GRANSKNING.** Inget i detta dokument är granskat, godkänt eller validerat innehåll. Det är genererat från migrationen `20261216090000_scp_security_manager_recruitment_content.sql` som den ser ut i en lokal databas (`bun run scripts/strategic-review-proposal.ts`), så att granskarna läser exakt de rader de tar ställning till. Innehållet är AI-författat mot produktens egna konstruktregler och ägarens specifikation (`docs/product/trust-beskt-content-gaps-2026-09-19.md` §3.1). Ingen psykometrisk egenskap påstås.",
);
p();
p("## 0. Status och vad som begärs");
p();
p(`| | Värde |`);
p(`|---|---|`);
p(
  `| Kandidattest | ${def.name_sv} / ${def.name_en} — version 1, \`${def.content_status}\`/\`${def.validation_status}\` |`,
);
p(
  `| Designerat som standardinnehåll för rekrytering | **${def.standard ? "JA" : "NEJ"}** (kräver ägarbeslut) |`,
);
p(
  `| Intervjuguide | ${pack.name_sv} v1 — \`${pack.content_status}\`, \`${pack.validation_label}\`, pilot **${pack.pilot_availability}**, innehållshash i den här databasen \`${pack.content_hash}\` |`,
);
p(
  `| Utestående granskningsgrindar på uppgifterna | ${gates} (${items.length} uppgifter × 5 grindar) |`,
);
p();
p(
  "**Begäran:** ett samlat innehållsgodkännande av (1) kravprofilen, (2) kandidattestet med poängsättning och rubriker, (3) intervjuguiden, (4) rapportavsnittets intervjufrågor, och därefter (5) ett uttryckligt beslut om aktivering: designation av testet som standardinnehåll och öppen pilot för guiden. Exakt aktivering: `docs/release/2026-09-26-strategic-level-content-approval.md`.",
);
p();
p("Syfte (programförklaring, sv): " + def.purpose_sv);
p();
p("Mäter INTE: " + def.dnm_sv.join("; ") + ".");
p();
p("## 1. Kravprofil: sex observerbara beteenden");
p();
p(
  "Roll `security-manager-se` (Säkerhetschef / Security Manager), version 1, utkast. Varje beteende är mappat till en kanonisk SCC-kompetens; mappningen är författarens läsning och granskas i expertgrinden.",
);
p();
for (const b of behaviours) {
  p(`### ${b.slug} → ${b.code} ${b.name_sv}`);
  p();
  p(`- **Beteende (sv):** ${b.statement_sv}`);
  p(`- **Behaviour (en):** ${b.statement_en}`);
  p(`- **Positiva indikatorer:** ${b.pos.join("; ")}`);
  p(`- **Kontraindikationer:** ${b.contra.join("; ")}`);
  p();
}
p("## 2. Kandidattest: sektioner, uppgifter och poängsättning");
p();
p(
  "Poängsättning: varje scenariouppgift har ett föredraget svar (3 poäng), ett delvis svar (1) och ett svar som visar ett namngivet feltyp (0). Självskattningar poängsätts 0–3 längs frekvensskalan, hälften omvänt kodade, och redovisas ALLTID som självrapporterat. Reflektioner poängsätts inte av maskin: en människa läser dem mot rubriken i avsnitt 3. Inga totalpoäng, ingen rangordning, inget gränsvärde. Rapporten redovisar evidens per kompetensområde, och otillräckligt underlag som otillräckligt.",
);
p();
for (const b of blocks) {
  const inBlock = items.filter((i) => i.block === b.block_key);
  p(`### ${b.name_sv} / ${b.name_en} (${inBlock.length} uppgifter, ${b.asks})`);
  p();
  p(`_${b.intro_sv}_`);
  p();
  for (const it of inBlock) {
    p(
      `#### ${it.order}. \`${it.slug}\` — ${it.competency} ${it.competency_sv}${it.facet ? ` · ${it.facet}` : ""} · ${it.behaviour}`,
    );
    p();
    p(
      `- Format \`${it.format}\`, evidens \`${it.evidence}\`, svårighet \`${it.difficulty}\`, kognitivt krav \`${it.demand}\`, testar \`${it.tests_what}\``,
    );
    p(`- Observerbart: ${it.observable}`);
    p(`- Övergeneraliseringsskydd: ${it.guard}`);
    p(`- **Scenario (sv):** ${it.scenario_sv}`);
    p(`- **Fråga (sv):** ${it.prompt_sv}`);
    p(`- **Scenario (en):** ${it.scenario_en}`);
    p(`- **Prompt (en):** ${it.prompt_en}`);
    if (it.options) {
      p();
      p(`| Alt | Poäng | Föredraget | Omvänd | Feltyp | Svar (sv) | Answer (en) | Motivering |`);
      p(`|---|---|---|---|---|---|---|---|`);
      for (const o of it.options) {
        p(
          `| ${o.key} | ${o.score} | ${o.preferred ? "ja" : ""} | ${o.reverse ? "ja" : ""} | ${o.error ?? ""} | ${o.sv} | ${o.en} | ${o.rationale ?? ""} |`,
        );
      }
    }
    p();
  }
}
p("## 3. Rubriker för reflektionerna (läses av en människa)");
p();
p("Nivåer per dimension: " + levels.map((l) => `${l.level} = ${l.sv}`).join("; "));
p();
for (const r of rubrics) {
  p(`### \`${r.item}\` — ${r.name_sv} / ${r.name_en}`);
  p();
  p(`Får inte dra slutsatser om: ${r.must_not_infer.join(", ")}.`);
  p();
  for (const d of r.dims) {
    p(
      `- **${d.name_sv} / ${d.name_en}**${d.writing ? " (skrivkvalitet – visas, räknas inte)" : ""}: ${d.criteria_sv} / ${d.criteria_en}`,
    );
  }
  p();
}
p("## 4. Intervjuguide: Säkerhetschef Role Interview Pack v1");
p();
p(pack.purpose_sv);
p();
p(pack.summary_sv);
p();
p("### Kompetenser och provisorisk mappning");
p();
for (const c of packComps) {
  p(
    `- **${c.code} ${c.name_sv}** — ${c.definition_sv} Indikatorer: ${c.indicators.join("; ")}. Mappning: ${c.maps.join(", ")}.`,
  );
}
p();
p("### Allmänna fördjupningsfrågor (godkända)");
p();
for (const g of generalProbes) p(`- ${g.purpose}: ${g.wording_sv}`);
p();
p("### De åtta fasta frågorna, i fast ordning");
p();
for (const q of questions) {
  p(`#### ${q.code} (${q.question_type}) — ${q.comps.join(", ")}`);
  p();
  p(q.prompt_sv);
  p();
  p(`- Evidensdimensioner: ${q.dims.join("; ")}`);
  p(`- Fördjupningsfrågor: ${q.probes.join(" · ")}`);
  p(`- Ankare:`);
  for (const a of q.anchors) p(`  - ${a.level} ${a.label}: ${a.anchor}`);
  p();
}
p("### Verifieringsgränser");
p();
for (const r of rules)
  p(
    `- **${r.requirement_sv}** (${r.states.join(", ")}): ${r.action} Efterföljande: ${r.subsequent} Passport: ${r.boundary}`,
  );
p();
p("### Förbjudna områden");
p();
for (const a of prohibited) p(`- (${a.area_type}) ${a.statement_sv}`);
p();
p("## 5. Rapportavsnitt: intervjufrågor för de självrapporterade områdena");
p();
p(
  "Evidensrapporten och intervjuförberedelsen läser kompetensvis; för självskattningar per facett. Åtta rollneutrala frågor lades till för de facetter testet beskriver och som saknade fråga. Observerade områden använder de befintliga kompetensfrågorna, varav några är formulerade för bevakningsarbete – en rollskiktad frågeuppsättning är en uppföljningspunkt, inte en del av detta förslag.",
);
p();
for (const pr of prompts) {
  p(
    `- **${pr.code} · ${pr.facet}:** ${pr.question_sv} _Följdfråga:_ ${pr.followup_sv} _Lyssna efter:_ ${pr.listen.join("; ")}`,
  );
}
p();
p("## 6. Granskningsstege");
p();
p(
  "Uppgifter: fem grindar per uppgift (security_sme, cognitive_interview, language, accessibility, pilot), alla utestående. Guide: draft → expert_review → legal_review → cognitive_review → published, med granskning per grind i `scp_interview_pack_reviews` bunden till innehållshashen; en granskare får inte vara författaren. Aktivering är två separata, återkallbara ägarbeslut och görs inte av innehållsmigrationen.",
);
p();
console.log(out.join("\n"));
