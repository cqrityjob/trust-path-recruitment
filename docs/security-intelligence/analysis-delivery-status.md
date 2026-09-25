# Security Work #290 delivery status

Updated 2026-09-25 for the controlled customer pilot. #290 was merged externally as `d178a4c04d16c184805c43c53ed7e80cf792215f`. At the owner's request, the same working branch now includes fresh main `ac7159ef9cc184d969faaf11397a97fe1722e11f`, including #291 and #292, through conflict-free normal merge `ae9fa26`. The merge result exactly matched main before the bounded pilot test/documentation changes. No employer implementation or merged migration was rewritten. This continuation is not another PR and has not been merged to main by this task.

| State                    | Evidence and boundary                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented              | Personal workspace entry after Passport; context → reviewed evidence → explained questions → AI draft → human review → immutable approved report → actions/revision. Exact versioned 25-cell RSA matrix, three report templates, SV/EN and explicit unknown values.                           |
| Verified in isolation    | Real Supabase RLS/sessions, actual PDF/DOCX processor, browser journeys, immutable report download/printing, synthetic AI completions and offline quality cases. These verify product contracts, not a real model's reasoning. Final commit, full CI and artifact links are recorded on #290. |
| Production configured    | Database schema only: read-only complete catalog parity and release ledger evidence are recorded in [hosted verification](analysis-hosted-verification.md). External processor, product AI credentials/approval and live monitoring are not configured by this delivery.                      |
| Verified against real AI | Not performed. The prepared synthetic pilot requires explicit owner approval and a separate QA key; every actual output then requires a professional's scored review.                                                                                                                         |
| Published for users      | The 25 September public asset now includes the seven-item menu and analysis routes. Its Git commit, signed-in customer flow, processor settings and live AI are not verified. The branch continuation is not published by this task. See [frontend visibility](frontend-visibility.md).       |

## Concrete decisions remaining for the owner

1. **Document processor:** approve one Fly.io Machine in Frankfurt, 2 shared vCPUs/1 GiB, estimated USD 8.03/30 days compute at the recorded 24 September price (recheck before provisioning) and a USD 15/month operating threshold. Select the organization/app and named operator; approve hosting/DPA/transfer/log handling and permitted document classifications. Authorize registry publication and deployment of the reviewed image, dedicated secrets, and a published synthetic upload test. The [tested package and operator runbook](processor-deployment.md) specify exact settings and rollback. Frankfurt does not establish EU-only processing.
2. **Synthetic AI pilot:** approve Anthropic commercial API with exact model `claude-sonnet-5`, six committed synthetic cases in SV/EN (12 one-shot attempts), USD 3 reservation, separate QA key/Console budget, named reviewer and dated, expiring approval for the exact plan/dataset hash. Standard retention and global-inference/US-storage terms require explicit acceptance; EU-only/ZDR is not established. The [provider decision](ai-provider-decision.md) and [executable rubric/runbook](ai-quality.md) are ready. Do not put keys in chat or GitHub.
3. **Production activation and publication:** after actual pilot results and professional review, separately approve production document/AI data handling, per-workspace permissions/budgets, deployment and a signed-in acceptance test on the published revision. A green PR or merge alone does not establish this state.

OCR is still unavailable. Scanned PDFs fail honestly and offer a working manual evidence path. Customer/SRS reports are not in the repository, fixtures, screenshots or published artifacts. No paid resource, external deployment, provider request, merge or publication is performed as part of preparing #290.

## Pilot entry criteria and customer instructions

A controlled customer pilot is **not yet approved to accept customer documents**.
First approve and configure the processor/data handling; then run the approved
synthetic live-AI evaluation and have a named professional score all 12 outputs.
Only after those outcomes and a separate customer-data decision should an operator
invite the first customer. The [Swedish pilot guide](customer-pilot-guide.md)
contains the test script, expected outcomes, stop criteria and owner/operator record.
A UI dry run with synthetic evidence can test usability, but is not an AI-quality
or production-processing pass.

Because #290 is already merged, a push to its branch no longer generates PR CI.
The four existing CI workflows therefore also run on pushes to this exact existing
branch. Their steps, permission levels, assertions and production boundaries remain
unchanged. Full CI plus Security Work, employer E4 and recruitment browser evidence
are recorded against the final continuation commit in the existing #290 description.
