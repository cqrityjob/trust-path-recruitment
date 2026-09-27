# Public homepage: guard aligned with the MVP layout, word budget per section

2026-09-27 · branch `claude/mvp-homepage-jobs-rpc-alignment`

## Why

`public-homepage:check` failed on main after the owner-approved MVP homepage
(seven sections: hero, value, employers, security-intelligence, get-started,
passport, faq) replaced the four-section page. The guard is aligned with the
MVP layout; every security, disclaimer, access, ranking and human-decision
assertion is kept.

The owner then decided (2026-09-27) that the MVP's content stays — repetition
cut, nothing necessary removed — and that the old 340-word ceiling, written for
the four-section page, be adapted to the new layout instead of the content being
cut to fit it.

## The 27 failures on main, classified

| Kind                                                                                                                                                                     | Count | Resolution                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Superseded by the MVP layout: section ids / count / order (T1), hero title (T2), h1, h2 and h3 sets and the subtitle (T3), the six lifecycle stages and their links (T8) | 17    | Assertions rewritten for the seven-section layout                                                                                        |
| Stale route inventory (T8): `/contact` and `/security-work` exist but were not listed                                                                                    | 3     | Inventory updated; both route files exist                                                                                                |
| `home.ai.title` identical in sv/en (T13)                                                                                                                                 | 1     | Added to the documented product-name allow-list, which now has to _prove_ each entry equals the product's own name (`sw.product`)        |
| **Real defect**: the value card said the superseded "Skapa ditt Security Passport" / "Create your Security Passport" (T2)                                                | 2     | The card uses the approved `cta.passport`                                                                                                |
| **Real defect**: "Plattformen rangordnar inte kandidater" / "does not rank candidates" (T14 bans the ranking vocabulary even negated)                                    | 2     | Reworded, same meaning: "sorterar inte kandidater från bäst till sämst" / "does not sort candidates from best to worst"; regex untouched |
| 718 (sv) / 776 (en) words against a 340 ceiling written for four sections (T15)                                                                                          | 2     | Ceiling adapted to the seven-section layout as a budget per section (below); the page is 692 / 749 words after the repetition cuts       |

## What is kept, and what was cut

Kept as the MVP had it, and now pinned where it renders (T16 and the browser
suite): the note that jobs can be read without an account; the employer
strip's own label, flow and registration; Security Intelligence's task, input,
output and review rows with their caveats; three steps each for a person and
an employer; the offer lists and all five questions, including verification
and who decides.

Cut, because each repeated something else on the page:

| Cut                                                                                                    | Repeated                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero eyebrow "Säkerhetskarriären samlad på ett ställe"                                                 | The h1 "Din karriär och ditt säkerhetsarbete. På samma plats."                                                                                                                     |
| Value card's first sentence "Samla certifieringar, behörigheter och utbildningar i Security Passport." | The hero's Passport card — and it claimed "utbildningar" for the Passport, against the owner's Passport scope (certifications, licences and authorisations; education is the CV's) |
| Passport preview's "Marknader i dag" band                                                              | The Passport section's market list, which also states that two of the three are closed pilots                                                                                      |
| "Du väljer själv vad du delar och med vem." in the Passport section                                    | The hero subtitle, the preview card and the sharing question                                                                                                                       |

## The word budget

Counted over everything a person sees, decoration included, as before. Each
section's ceiling is its approved content in the longer language plus about
five per cent, rounded up to a multiple of five; the page's total ceiling is
lower than the sum of the sections, so the headroom cannot be spent everywhere
at once. A section grows by raising its own line in
`scripts/public-homepage-check.tsx` (T15).

| Section               | sv  | en  | Budget  |
| --------------------- | --- | --- | ------- |
| hero                  | 144 | 154 | 165     |
| value                 | 93  | 99  | 105     |
| employers             | 39  | 43  | 50      |
| security-intelligence | 104 | 118 | 125     |
| get-started           | 70  | 71  | 75      |
| passport              | 49  | 54  | 60      |
| faq                   | 193 | 210 | 225     |
| **page**              | 692 | 749 | **780** |

The hero subtitle keeps its own 40-word ceiling.

## Changed strings

| Key                                                                             | Before (sv / en)                                                                                                                                                                             | After (sv / en)                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `home.value.passport.body`                                                      | "Samla certifieringar, behörigheter och utbildningar i Security Passport. Varje merit visar …" / "Keep certifications, licences and training in Security Passport. Every credential shows …" | "Varje merit visar sin källa och status, och du bestämmer vad som delas och med vem." / "Every credential shows its source and status, and you decide what is shared and with whom." |
| value card link                                                                 | `home.value.passport.link`: "Skapa ditt Security Passport" / "Create your Security Passport"                                                                                                 | `cta.passport`: "Skapa mitt Security Passport" / "Create my Security Passport"                                                                                                       |
| `home.faq.a5`                                                                   | "… Plattformen rangordnar inte kandidater." / "… The platform does not rank candidates."                                                                                                     | "… Plattformen sorterar inte kandidater från bäst till sämst." / "… The platform does not sort candidates from best to worst."                                                       |
| `home.markets.body`                                                             | "Sverige är öppet. Storbritannien och Dubai är i sluten pilot. Du väljer själv vad du delar och med vem." / "… You decide what you share and with whom."                                     | "Sverige är öppet. Storbritannien och Dubai är i sluten pilot." / "Sweden is open. Great Britain and Dubai are in closed pilot."                                                     |
| `home.hero.eyebrow`, `home.value.passport.link`, `home.passportPreview.markets` | as above                                                                                                                                                                                     | deleted, and listed as retired in the guard                                                                                                                                          |

Every other homepage string is the MVP's, unchanged.

## Open for the owner

- `/contact`, linked from the offer text, is a preview form that sends nothing —
  its own notice says so, and the footer deliberately does not link it. The
  link is kept, as the plan instructs; the guard now requires the contact page
  to keep saying so while the form sends nothing.
- Job-card hyphenation, the ad's presentation, the mobile filters and the hero
  button spacing belong to Lovable's later design pass and are untouched here.

## Evidence

- `bun run public-homepage:check` — 0 failures (was 27), with the per-section
  budget and the new T16.
- `e2e/public-homepage.spec.ts` runs in CI (`public-entry-browser`) against the
  running application and uploads routed screenshots at 1440 / 375 / 390 px in
  sv and en. It opens the questions by keyboard and reads the answers.
