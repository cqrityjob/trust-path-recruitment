# AI readiness — inventory, contracts and the one-layer target

**Status: no AI provider is active; no key exists in the repository; nothing here activates one.** Audited on `main` `b7ed12f`, 2026-09-28.

## 1. What exists today

| Surface | Where | Contract / mechanism | Class today |
|---|---|---|---|
| Interview Intelligence proposals (role requirements, candidate facts, preparation brief, evidence proposals, report draft) | `src/lib/interview-intelligence/ai/` (orchestrator, policy, registry, providers/anthropic.ts) | `selectProvider()` fails closed without `INTERVIEW_AI_PROVIDER` + `ANTHROPIC_API_KEY`; the deterministic engine is refused outside lab environments; DB gate `scp_interview_ai_config.ai_enabled=false`; every task requires human review; the policy forbids hiring recommendations; runs/retrievals are logged in `scp_interview_ai_runs` | **B** AI-ready, off |
| Recruitment writing help ("Föreslå text med AI": vacancy text, questions, candidate messages) | `src/lib/recruitment/ai.functions.ts` | same `selectProvider()`, plus `scp_iv_ai_real_model_permitted()` (service role); returns a labelled template when off; never writes to the DB; "no match percentage, no ranking, no recommendation" | **A** template / **B** model |
| Academy reviewer "AI-förslag" | `src/lib/security-competency/review-proposal.ts`, `ReviewQueue.tsx` | proposal is `null`; `scp_ai_providers.anthropic.is_enabled=false`, `null_provider` = human review; forbidden-output list blocks verdict/score fields | **B** contract only |
| CV drafting | `src/lib/professional-identity/cv/generation.ts` | `selectProvider()`; on unavailability the factual CV is served with no AI authorship label | **B** (factual CV = A) |
| Security Work "AI-stöd" | `src/lib/security-work/processing/ai-jobs.server.ts`, `ai.server.ts`, worker in `deploy/security-work-processor` | needs `SW_AI_ENABLED`, `SW_AI_PROVIDER=anthropic`, `SW_AI_MODEL`, `SW_AI_ENVIRONMENT`, `SW_ANTHROPIC_API_KEY`, worker signing keys, an approved `sw_ai_activations` row with data-processing approval and budget | **B** |
| HAYAT credential verification | `src/lib/security-passport/hayat/` | deterministic (signature, issuer registry, Open Badge); `sp_evidence_extractions` unused ("Execution adapter not implemented") | **A** / **D** |
| Career Discovery matching, Passport employer matching, assessment scoring | rule-based engines | explicitly "no AI" in code | **A** |
| "Fråga CQrity" | `/employer/$slug/ask-cqrity` | four static links | **A/D** (naming) |
| MCP endpoint `/mcp` | `src/routes/mcp.ts` | deterministic tools, off unless `CQRITYJOB_MCP_ENABLED` + token | **A** |

**Human-decision boundary, verified:** no code path changes an application status, an employer status or a report decision from a model output. Interview policy rejects employment recommendations; review proposals cannot carry verdicts; recruitment AI writes nothing; status changes are human RPCs.

## 2. Target: one server-side AI integration layer

The repository already has the pieces of a single layer, spread across three call sites (`interview-intelligence/ai`, `recruitment/ai.functions.ts`, `security-work/processing`). The target is to keep **one** provider adapter + policy + audit path and have every feature call it:

```
feature server function ──► ai/gateway (server only)
                              ├─ policy: task registry, forbidden outputs, data-minimisation per task
                              ├─ provider adapter (Anthropic today; interface for others)
                              ├─ secrets: ANTHROPIC_API_KEY (server env only, never VITE_)
                              ├─ audit: scp_interview_ai_runs-style ledger (task, model, prompt version, input hash, output, reviewer)
                              └─ kill switch: DB config row (ai_enabled) + env
```

Rules the layer must keep (all present in the interview layer today; extend rather than re-implement):
1. **Server-side only.** The Anthropic adapter already refuses construction in a browser. Keys live in Hostinger env; the browser never calls a provider.
2. **Task registry with human review.** Each task names its inputs, the fields a model may not produce (verdicts, scores, hire/reject), and that a person confirms before anything is stored as a decision.
3. **Data minimisation per task.** What each feature would send: Interview — role pack content, recruiter's own notes, candidate facts the recruiter already entered (never the Passport, CV or application answers unless the task explicitly lists them); Recruitment writing — vacancy text and structured requirements, no candidate data; CV — the candidate's own CV facts at their request; Academy — an anonymised response and rubric; Security Work — the workspace's own documents under an approved activation.
4. **GDPR.** A provider is a processor: DPA with the provider, EU data residency or a documented transfer basis, retention of prompts/outputs decided per task, candidate information in the privacy notice (`docs/passport/privacy-processing-matrix.md` pattern), no special-category data in prompts, a per-task "what left the system" audit line the owner can show a data subject.
5. **Deterministic scoring stays.** Career Discovery, assessment scoring and matching are not routed through the layer; AI explains or drafts, it never scores.

## 3. Recommended first AI feature

**Recruitment writing help (vacancy text and screening questions)** — post-launch, first. It sends no candidate data, its fallback (labelled template) already exists, its output is reviewed by the recruiter before saving, and it exercises the whole layer (policy, adapter, audit, kill switch) with the lowest privacy exposure. Interview Intelligence proposals second (already gated by `ai_enabled` and a task registry). CV drafting third (candidate-initiated, own data). Academy and Security Work later, each with its own data-processing approval.

Not for launch: none of the above. The product launches with class A behaviour everywhere and honest "AI-stöd är inte aktiverat" copy, which is the current state.

## 4. Activation checklist (when the owner decides)

- [ ] Choose provider, sign DPA, confirm data residency/transfer basis.
- [ ] `ANTHROPIC_API_KEY` (server env only), `INTERVIEW_AI_PROVIDER=anthropic`, `INTERVIEW_AI_ENVIRONMENT=production`; then the DB switch `scp_interview_ai_config.ai_enabled` per feature.
- [ ] Prompt/policy versions pinned and recorded in the run ledger.
- [ ] Privacy notice and candidate information updated; retention set.
- [ ] Human-review gate verified in staging with synthetic data; AI-01 naming ("Fråga CQrity" → "Genvägar") fixed so no surface promises an assistant that does not exist.
