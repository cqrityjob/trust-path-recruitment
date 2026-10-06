# Source-to-design record · 2026-10-06

Only general method/product principles informed this independently implemented original pilot. No provider questions, images, norms, report prose, code or dataset were imported. Existing repository dependencies remain unchanged.

| Source | Material actually reviewed | General insight → original decision | Reuse |
|---|---|---|---|
| [Assessio Matrigma](https://helpcenter2.assessio.com/product-documentation/matrigma) | Public product documentation | Clear matrix instructions and distinct feedback → original SV/EN information and separate reports. We use fixed form/raw scores, not adaptive calibration or C-scale. | None |
| [Aon preparation hub](https://www.aon.com/en/capabilities/talent-and-rewards/prepare-for-your-online-assessment) | Public preparation page | Teach the particular format before timing → three separate untimed practice tasks, explanations and explicit start. | None |
| [Barrett et al., ICML 2018](https://arxiv.org/abs/1807.04225) | Abstract | Procedural reasoning research → original deterministic structured specifications and broad seed tests. Machine-learning findings do not validate human recruitment use. | None |
| [DeepMind PGM repository](https://github.com/google-deepmind/abstract-reasoning-matrices) | README and data-restriction statement | Symbolic objects/attributes/relations → original SVG atoms and encoded constraints. Non-commercial data restriction respected. | None |
| [ITC computer/internet testing guidelines](https://www.intestcom.org/files/guideline_computer_based_testing.pdf) | Overview/contents available to retrieval | Consider technology, privacy and preparation separately → access checks, explicit practice and documented release prerequisites. No full-document compliance claim. | None |
| [W3C keyboard understanding](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) | Keyboard guidance | Keyboard controls/focus → native radio groups and visible focus; visual impairment limitation explicitly retained. No WCAG conformance certification. | None |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | Official RLS guidance | Private data must have database-enforced access → RLS, revoked client table access and narrowly scoped authenticated RPCs. | Existing Supabase dependency only |

The attachment also lists historical Assessio manuals, specific Aon practice PDFs, Pearson sample material, SHL examples and the RAVEN paper. Their contents were not used as implementation evidence in this run; no claim that their figures/examples or full papers were reviewed. Restricted or unavailable materials were not made prerequisites. Supabase changelog retrieval was unavailable; local migration replay and permission tests provide the implementation evidence, not a claim about the latest hosted release.
