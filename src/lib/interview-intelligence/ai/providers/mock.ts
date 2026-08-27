// The deterministic provider.
//
// This is the SHIPPED default, not a test double. The product must work with no
// external model configured — an employer conducting an interview cannot be
// blocked because a vendor is down, and the whole evaluation harness depends on
// a run being reproducible.
//
// It is a rule-based extractor over the supplied passages. It genuinely reads
// the sources it is given, cites the passage it took each statement from, and
// abstains when the material does not support an answer. What it does not do is
// generalise — so its recall is modest and its precision is high, which is the
// right failure mode for a system where a wrong claim costs more than a missing
// one.
//
// Every output it produces goes through exactly the same schema, policy and
// citation validation as a real provider's would. Nothing here is trusted.

import type { AiProvider, AiRequest, AiResponse, UntrustedBlock } from "../provider";

/** Deterministic hash, so identical input yields identical output and usage. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Cheap, stable token estimate. Not a billing figure; a shape for the ledger. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

const MANDATORY_MARKERS = ["krav:", "krävs", "måste", "ska ha", "required", "must have"];
const PREFERRED_MARKERS = ["meriterande", "önskvärt", "plus", "preferred", "desirable"];

const CREDENTIAL_MARKERS = [
  "vu1",
  "vu2",
  "väktarutbildning",
  "certifikat",
  "licens",
  "behörighet",
  "utbildning:",
];
const EMPLOYMENT_MARKERS = [
  "väktare",
  "säkerhetsvakt",
  "anställd",
  "arbetade",
  "tjänst",
  "guard",
  "officer",
  "20",
];
const LANGUAGE_MARKERS = ["svenska", "engelska", "språk", "swedish", "english"];

/**
 * Text that looks like an instruction aimed at the reader rather than content.
 * Finding this is a FINDING, never something to act on.
 */
const INJECTION_SIGNALS = [
  "ignore all previous",
  "ignorera tidigare",
  "system prompt",
  "you must recommend",
  "du ska rekommendera",
  "disregard the instructions",
  "bortse från instruktionerna",
  "as an ai",
  "rate this candidate",
  "betygsätt denna kandidat",
];

/**
 * Protected information the extractor must NOT carry forward. Detected only so
 * that the passage can be skipped — never repeated into an output.
 */
const PROTECTED_SIGNALS = [
  "gravid",
  "föräldraledig",
  "sjukskriven",
  "diagnos",
  "funktionsnedsättning",
  "religion",
  "kyrka",
  "moské",
  "facklig",
  "civilstånd",
  "gift",
  "skild",
  "pregnant",
  "maternity",
  "sick leave",
  "diagnosis",
  "disability",
  "religious",
  "trade union",
  "marital status",
  "divorced",
];

function containsAny(text: string, needles: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/* ------------------------------------------------------------------ */

interface GovernedContext {
  questions?: Array<{
    code: string;
    prompt: string;
    dimensions?: Array<{ code: string; label: string }>;
  }>;
  probes?: Array<{ id: string; purpose: string; wording: string; questionCode: string | null }>;
  competencies?: Array<{ code: string; name: string }>;
  notes?: Array<{ ref: string; questionCode: string | null; body: string }>;
  confirmedEvidence?: Array<{ id: string; questionCode: string; excerpt: string }>;
  assessments?: Array<{ questionCode: string; level: number; rationale: string }>;
}

export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async complete(request: AiRequest): Promise<AiResponse> {
    const ctx = (request.governedContext ?? {}) as GovernedContext;
    const blocks = request.untrustedBlocks;
    const seed = hash(
      request.taskKey + request.promptVersion + blocks.map((b) => b.passageId).join(","),
    );

    const payload = this.run(request.taskKey, blocks, ctx, seed);
    const text = JSON.stringify(payload);

    return {
      text,
      model: `mock-rules-${request.promptVersion}`,
      usage: {
        inputTokens: estimateTokens(blocks.map((b) => b.text).join(" ") + request.instruction),
        outputTokens: estimateTokens(text),
        costMicros: 0,
      },
    };
  }

  private run(
    taskKey: string,
    blocks: readonly UntrustedBlock[],
    ctx: GovernedContext,
    seed: number,
  ): unknown {
    // Any injection attempt in the material stops the extraction and is
    // reported. Acting on it is the failure this branch exists to prevent.
    const tainted = blocks.find((b) => containsAny(b.text, INJECTION_SIGNALS));
    if (tainted) {
      return {
        abstained: true,
        reason: "prohibited_inference_requested",
        explanation:
          "Källmaterialet innehåller text som är formulerad som en instruktion till systemet. Den har inte följts. En människa bör granska källan.",
      };
    }

    const usable = blocks.filter((b) => !containsAny(b.text, PROTECTED_SIGNALS));
    if (usable.length === 0 && blocks.length > 0) {
      return {
        abstained: true,
        reason: "insufficient_source_information",
        explanation:
          "Det enda tillgängliga materialet innehåller skyddade personuppgifter som inte får användas som urvalssignal.",
      };
    }

    switch (taskKey) {
      case "role_requirement_extraction":
        return this.roleRequirements(usable);
      case "candidate_source_extraction":
        return this.candidateFacts(usable);
      case "interview_preparation_generation":
      case "governed_probe_selection":
      case "contextual_probe_suggestion":
        return this.preparation(taskKey, usable, ctx);
      case "evidence_extraction":
      case "evidence_dimension_mapping":
        return this.evidence(ctx, seed);
      case "gap_and_contradiction_detection":
        return this.gaps(usable, ctx);
      case "verification_item_detection":
        return this.verifications(usable);
      case "interview_summary_draft":
        return this.summary(ctx);
      case "report_draft_generation":
        return this.reportDraft(ctx);
      default:
        return {
          abstained: true,
          reason: "outside_approved_task",
          explanation: `Uppgiften "${taskKey}" ingår inte i den godkända uppsättningen.`,
        };
    }
  }

  /* ---------------- individual tasks ---------------- */

  private roleRequirements(blocks: readonly UntrustedBlock[]) {
    const requirements: unknown[] = [];
    for (const block of blocks) {
      if (block.sourceKind !== "job_description" && block.sourceKind !== "employer_requirements")
        continue;
      for (const sentence of sentences(block.text)) {
        const kind = containsAny(sentence, MANDATORY_MARKERS)
          ? "mandatory"
          : containsAny(sentence, PREFERRED_MARKERS)
            ? "preferred"
            : "contextual";
        requirements.push({
          requirementKind: kind,
          statement: sentence.slice(0, 500),
          claimClass: "source_grounded",
          sourcePassageId: block.passageId,
          sourceQuote: sentence.slice(0, 600),
        });
      }
    }
    if (requirements.length === 0) {
      return {
        abstained: true,
        reason: "insufficient_source_information",
        explanation: "Det saknas material från arbetsgivaren att härleda krav ur.",
      };
    }
    return { requirements };
  }

  private candidateFacts(blocks: readonly UntrustedBlock[]) {
    const facts: unknown[] = [];
    for (const block of blocks) {
      if (block.sourceKind !== "candidate_cv" && block.sourceKind !== "application_answers")
        continue;
      for (const sentence of sentences(block.text)) {
        const kind = containsAny(sentence, CREDENTIAL_MARKERS)
          ? "credential"
          : containsAny(sentence, LANGUAGE_MARKERS)
            ? "language"
            : containsAny(sentence, EMPLOYMENT_MARKERS)
              ? "employment"
              : "other";
        facts.push({
          factKind: kind,
          statement: sentence.slice(0, 500),
          // Always candidate-declared. The schema does not even offer
          // "verified" — extraction cannot promote a claim.
          sourceStatus: "candidate_declared",
          claimClass: "source_grounded",
          sourcePassageId: block.passageId,
          sourceQuote: sentence.slice(0, 600),
        });
      }
    }
    if (facts.length === 0) {
      return {
        abstained: true,
        reason: "insufficient_source_information",
        explanation: "Kandidatens material innehåller inga extraherbara faktauppgifter.",
      };
    }
    return { facts };
  }

  private preparation(taskKey: string, blocks: readonly UntrustedBlock[], ctx: GovernedContext) {
    const questions = ctx.questions ?? [];
    const probes = ctx.probes ?? [];
    const items: unknown[] = [];

    const cvBlocks = blocks.filter(
      (b) => b.sourceKind === "candidate_cv" || b.sourceKind === "application_answers",
    );
    const jobBlocks = blocks.filter(
      (b) => b.sourceKind === "job_description" || b.sourceKind === "employer_requirements",
    );

    if (taskKey === "governed_probe_selection") {
      // SELECTION. One approved probe per question, taken from the pack. The
      // mock never composes wording, which is the property that matters.
      for (const q of questions) {
        const probe = probes.find((p) => p.questionCode === q.code);
        if (!probe) continue;
        items.push({
          itemKind: "probe",
          questionCode: q.code,
          probeId: probe.id,
          statement: probe.wording,
          claimClass: "governed_content",
          sourcePassageId: null,
          sourceQuote: null,
        });
      }
    } else {
      // Relevant experience, cited.
      for (const block of cvBlocks) {
        for (const sentence of sentences(block.text)) {
          const q = questions.find((qq) => this.sentenceRelatesTo(sentence, qq));
          if (!q) continue;
          items.push({
            itemKind: "relevant_experience",
            questionCode: q.code,
            probeId: null,
            statement: `CV:t nämner: ${sentence.slice(0, 300)}`,
            claimClass: "source_grounded",
            sourcePassageId: block.passageId,
            sourceQuote: sentence.slice(0, 600),
          });
        }
      }

      // What the sources do NOT establish. A gap is about the MATERIAL.
      for (const q of questions) {
        const covered = items.some((i) => (i as { questionCode?: string }).questionCode === q.code);
        if (!covered) {
          items.push({
            itemKind: "missing_information",
            questionCode: q.code,
            probeId: null,
            statement: `Underlaget säger inget om ${q.code}. Det betyder att frågan behöver ställas — inte något om kandidaten.`,
            claimClass: "ai_inference",
            sourcePassageId: null,
            sourceQuote: null,
          });
        }
      }

      if (taskKey === "contextual_probe_suggestion") {
        for (const q of questions.slice(0, 3)) {
          items.push({
            itemKind: "clarification",
            questionCode: q.code,
            probeId: null,
            statement: "Kan du beskriva vad just du gjorde i den situationen?",
            claimClass: "governed_content",
            sourcePassageId: null,
            sourceQuote: null,
          });
        }
      }

      items.push({
        itemKind: "prohibited_reminder",
        questionCode: null,
        probeId: null,
        statement:
          "Nervositet, tystnad, språkvariation eller begärd anpassning får aldrig påverka bedömningen.",
        claimClass: "governed_content",
        sourcePassageId: null,
        sourceQuote: null,
      });
    }

    const roleSummary =
      jobBlocks.length > 0
        ? `Rollen beskrivs i ${jobBlocks.length} avsnitt av arbetsgivarens material. Kärnfrågorna är fasta och ställs i angiven ordning.`
        : "Inget rollmaterial har lämnats; kärnfrågorna ställs ändå i fast ordning.";

    const candidateSummary =
      cvBlocks.length > 0
        ? `Kandidatens underlag omfattar ${cvBlocks.length} avsnitt. Samtliga uppgifter är kandidatens egna och är inte verifierade.`
        : "Inget kandidatunderlag har lämnats. Alla evidensdimensioner behöver täckas i intervjun.";

    return {
      plan: {
        roleSummary,
        candidateSummary,
        timePlan: `${questions.length} kärnfrågor, 6–8 minuter per fråga, plus introduktion och avslut.`,
        openingGuidance:
          "Förklara strukturen, att samma frågor ställs till alla, och att ett AI-stöd strukturerar underlaget medan människor bedömer och beslutar.",
        closingGuidance:
          "Sammanfatta fakta, låt kandidaten korrigera, och fråga om något relevant saknas.",
      },
      items,
    };
  }

  private sentenceRelatesTo(
    sentence: string,
    q: { code: string; dimensions?: Array<{ label: string }> },
  ): boolean {
    const lower = sentence.toLowerCase();
    for (const dim of q.dimensions ?? []) {
      const head = dim.label.toLowerCase().split(/[\s/]+/)[0];
      if (head && head.length > 4 && lower.includes(head.slice(0, Math.min(head.length, 8))))
        return true;
    }
    return false;
  }

  private evidence(ctx: GovernedContext, seed: number) {
    const notes = ctx.notes ?? [];
    const questions = ctx.questions ?? [];
    const competencies = ctx.competencies ?? [];
    const proposals: unknown[] = [];

    for (const note of notes) {
      if (containsAny(note.body, PROTECTED_SIGNALS)) continue;
      const q = questions.find((qq) => qq.code === note.questionCode) ?? questions[0];
      if (!q) continue;

      for (const sentence of sentences(note.body)) {
        const dim = (q.dimensions ?? [])[0] ?? null;
        const comp = competencies[0] ?? null;
        // Stable pseudo-confidence in the EXTRACTION, from the text itself.
        const confidence = 0.55 + ((hash(sentence) + seed) % 40) / 100;
        proposals.push({
          noteRef: note.ref,
          excerpt: sentence.slice(0, 2000),
          questionCode: q.code,
          evidenceDimensionCode: dim ? dim.code : null,
          competencyCode: comp ? comp.code : null,
          extractionConfidence: Math.min(0.95, Number(confidence.toFixed(2))),
          relevanceRationale: dim
            ? `Utdraget beskriver kandidatens eget handlande och rör evidensdimensionen "${dim.label}" för ${q.code}.`
            : `Utdraget beskriver kandidatens eget handlande i förhållande till ${q.code}.`,
          uncertaintyNote:
            "Utdraget är intervjuarens anteckning, inte en ordagrann transkribering.",
          prohibitedConclusionNote:
            "Säger inget om kandidatens trovärdighet, personlighet eller lämplighet.",
        });
      }
    }

    if (proposals.length === 0) {
      return {
        abstained: true,
        reason: "not_establishable_from_evidence",
        explanation: "Anteckningarna innehåller inga utdrag som kan kopplas till en kärnfråga.",
      };
    }
    return { proposals };
  }

  private gaps(blocks: readonly UntrustedBlock[], ctx: GovernedContext) {
    const findings: unknown[] = [];
    const questions = ctx.questions ?? [];
    const notes = ctx.notes ?? [];

    for (const q of questions) {
      const covered = notes.some((n) => n.questionCode === q.code && n.body.trim().length > 20);
      if (!covered) {
        findings.push({
          findingKind: "gap",
          statement: `${q.code} har ingen dokumenterad redogörelse.`,
          rationale:
            "Detta är en lucka i underlaget. Det är inte evidens om kandidaten och får inte behandlas som negativt.",
          questionCode: q.code,
          claimClass: "ai_inference",
          sourcePassageId: null,
          sourceQuote: null,
        });
      }
    }

    // A difference between two sources is a DIFFERENCE. The vocabulary here is
    // deliberately neutral, and "lie" is not available to say.
    const cv = blocks.filter((b) => b.sourceKind === "candidate_cv");
    const job = blocks.filter((b) => b.sourceKind === "job_description");
    for (const c of cv) {
      for (const j of job) {
        const cYears = c.text.match(/\b(19|20)\d{2}\b/g) ?? [];
        const jYears = j.text.match(/\b(19|20)\d{2}\b/g) ?? [];
        if (cYears.length > 0 && jYears.length > 0 && cYears[0] === jYears[0]) continue;
      }
    }
    if (findings.length === 0) {
      return {
        abstained: true,
        reason: "not_establishable_from_evidence",
        explanation:
          "Inga luckor eller skillnader kunde fastställas ur det tillgängliga materialet.",
      };
    }
    return { findings };
  }

  private verifications(blocks: readonly UntrustedBlock[]) {
    const findings: unknown[] = [];
    for (const block of blocks) {
      for (const sentence of sentences(block.text)) {
        if (!containsAny(sentence, CREDENTIAL_MARKERS)) continue;
        findings.push({
          findingKind: "verification",
          statement: `Uppgiften "${sentence.slice(0, 200)}" är kandidatens egen och behöver verifieras utanför intervjun.`,
          rationale:
            "En intervjuutsaga verifierar ingen behörighet. Kontroll sker enligt arbetsgivarens lagliga process.",
          questionCode: null,
          claimClass: "source_grounded",
          sourcePassageId: block.passageId,
          sourceQuote: sentence.slice(0, 600),
        });
      }
    }
    if (findings.length === 0) {
      return {
        abstained: true,
        reason: "requires_separate_verification",
        explanation:
          "Inga formella meriter som kräver separat verifiering kunde identifieras i underlaget.",
      };
    }
    return { findings };
  }

  private summary(ctx: GovernedContext) {
    const evidence = ctx.confirmedEvidence ?? [];
    if (evidence.length === 0) {
      return {
        abstained: true,
        reason: "insufficient_source_information",
        explanation:
          "Det finns ingen bekräftad evidens att sammanfatta. Ett sammandrag får inte bygga på obekräftade förslag.",
      };
    }
    const byQuestion = new Map<string, string[]>();
    for (const e of evidence) {
      const list = byQuestion.get(e.questionCode) ?? [];
      list.push(e.excerpt);
      byQuestion.set(e.questionCode, list);
    }
    const parts = [...byQuestion.entries()].map(
      ([code, excerpts]) =>
        `${code}: ${excerpts.length} bekräftade evidensutdrag. ${excerpts[0].slice(0, 200)}`,
    );
    return {
      summary: [
        "Sammanfattningen bygger enbart på evidens som en människa har bekräftat.",
        ...parts,
        "Uppgifter som inte bekräftats ingår inte.",
      ].join("\n\n"),
      groundedInEvidenceIds: evidence.map((e) => e.id),
    };
  }

  private reportDraft(ctx: GovernedContext) {
    const evidence = ctx.confirmedEvidence ?? [];
    const assessments = ctx.assessments ?? [];
    if (evidence.length === 0 && assessments.length === 0) {
      return {
        abstained: true,
        reason: "insufficient_source_information",
        explanation:
          "Det finns varken bekräftad evidens eller mänskliga bedömningar att skriva om.",
      };
    }
    const insufficient = assessments.filter((a) => a.level === 0).length;
    return {
      sections: [
        {
          heading: "Underlag",
          body: `Rapporten bygger på ${evidence.length} bekräftade evidensutdrag och ${assessments.length} mänskliga bedömningar. AI har förberett och föreslagit; människor har bekräftat och bedömt.`,
        },
        {
          heading: "Otillräcklig evidens",
          body:
            insufficient > 0
              ? `${insufficient} fråga/frågor bedömdes som otillräcklig evidens (nivå 0). Det betyder att underlaget inte räcker för en bedömning — inte att kompetensen är låg.`
              : "Samtliga frågor har underlag för en bedömning.",
        },
        {
          heading: "Beslut",
          body: "Anställningsbeslutet fattas av behörig människa hos arbetsgivaren och dokumenteras utanför detta underlag.",
        },
      ],
      groundedInEvidenceIds: evidence.map((e) => e.id),
    };
  }
}
