# Security Officer – Sweden (Väktare) — module blueprint

**Slug:** `security-officer-se` · **Market:** SE · **Legally regulated:** yes
**Validation status:** `design` — no items authored, not assignable.

Väktare is a regulated Swedish role. Content that depends on law, authority regulations or formal powers requires `legal_basis_required = true` and qualified legal review before publication. Swedish requirements do not apply automatically in any other market.

## Content domains the module must cover

| Domain | Primary Core constructs |
|---|---|
| Patrol and inspection work | SCC-03, SCC-09 |
| Observation and anomaly identification | SCC-03, SCC-02 |
| Access and visitor situations | SCC-07, SCC-02 |
| Alarm and incident handling | SCC-04, SCC-03 |
| Customer and public interaction | SCC-07, SCC-06 |
| Reporting and escalation | SCC-06, SCC-09 |
| Lone working | SCC-04, SCC-09, SCC-05 |
| Handover and continuity | SCC-06, SCC-08, SCC-09 |
| Prioritisation | SCC-04, SCC-11 |
| Service without compromising security | SCC-07, SCC-11 |

## Targets

~48 draft items in the bank; ~24 in the first operational form; 12–15 minutes.

## Separation of content types

Keep these apart — an item must not blend them, and only the first belongs in the Core:

- **Behavioural judgement** — Core territory, country-neutral.
- **Role knowledge** — what a väktare does; module territory.
- **Legal knowledge** — powers and obligations under Swedish law; module territory, legal review mandatory.
- **Employer-specific procedure** — never testable; a candidate cannot be expected to know an employer's internal policy (spec 7.5).

## Open question for the owner

`security-guard-foundation` collapsed Väktare and Ordningsvakt into one definition. They are separate roles with different legal mandates and are modelled here as separate modules. Whether the two genuinely need separate item banks, or can share a substantial subset, is a job-analysis and SME decision — not an engineering one.
