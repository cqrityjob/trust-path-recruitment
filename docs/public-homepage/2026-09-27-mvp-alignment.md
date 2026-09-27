# Public homepage: guard aligned with the MVP layout, copy held to 340 words

2026-09-27 · branch `claude/mvp-homepage-jobs-rpc-alignment`

## Why

`public-homepage:check` failed on main after the owner-approved MVP homepage
(seven sections: hero, value, employers, security-intelligence, get-started,
passport, faq) replaced the four-section page. The instruction was to align
the guard with the MVP layout, keep every security, human-decision and
disclaimer assertion, keep the existing 340-word ceiling, fix real defects and
weaken no check.

## The 27 failures on main, classified

| Kind                                                                                                                                                                                                  | Count | Resolution                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| Superseded by the MVP layout: section ids / count / order (T1), hero title (T2), h1, h2 and h3 sets and the subtitle (T3), the six lifecycle stages, their ordered list and the Trust stage link (T8) | 17    | Assertions rewritten for the seven-section layout                                                                                 |
| Stale route inventory (T8): `/contact` and `/security-work` exist but were not listed                                                                                                                 | 3     | Inventory updated; both route files exist                                                                                         |
| `home.ai.title` identical in sv/en (T13)                                                                                                                                                              | 1     | Added to the documented product-name allow-list, which now has to _prove_ each entry equals the product's own name (`sw.product`) |
| **Real defect**: the value card said the superseded "Skapa ditt Security Passport" / "Create your Security Passport" (T2)                                                                             | 2     | The card now uses the approved `cta.passport`                                                                                     |
| **Real defect**: "Plattformen rangordnar inte kandidater" / "does not rank candidates" (T14 bans the ranking vocabulary even negated)                                                                 | 2     | Reworded, same meaning; regex untouched                                                                                           |
| **Real defect**: 718 (sv) / 776 (en) words against the 340 ceiling (T15)                                                                                                                              | 2     | Copy condensed to 315 / 336; ceiling unchanged                                                                                    |

## What the condensation removed

Only repetition of the hero and secondary detail. Removed from the page (and
their now-unused keys from `dictionaries.ts`):

- Hero: the eyebrow (it repeated the h1), the note "Lediga jobb kan du läsa
  utan konto."
- Passport preview: the "Marknader i dag" band — the Passport section names the
  same markets together with their pilot status, which the band omitted.
- Value: the eyebrow and the three card bodies; each card's heading is now its
  link.
- Employers: the eyebrow and the step numerals (the flow is an ordered list).
- Security Intelligence: the eyebrow and the four-row task / input / output /
  review table.
- Get started: the eyebrow and the employer column (the employer strip above
  already carries the employer flow).
- FAQ: the eyebrow, the two offer lists, and four of the five questions.

The owner's preview review (`.lovable/plan.md`, 2026-09-27) lists the jobs note
and the five FAQ questions as present. They are gone here because the ceiling
was kept. Restoring them needs an explicit owner decision on a new ceiling;
this branch did not raise it.

## What is unchanged, verbatim

Every string the guard pins as owner-approved: both entry cards, both
actions, the anonymous-start disclosure, the employer strip, the Passport
disclaimer, the three trust levels and the markets. And every safety sentence
the MVP sections carry, now pinned by the new T16:

- the employer flow ends in "Ni fattar beslutet" / "You make the decision";
- "Lägg inte in säkerhetsskyddsklassificerad eller hemlig information.
  Arbetsytan delas inte med ditt CV, Security Passport eller arbetsgivare.";
- "… du står för bedömningen" and AI drafts "där funktionen är aktiverad";
- "Nej. Människor fattar och dokumenterar varje beslut. Plattformen sorterar
  inte kandidater från bäst till sämst." — shown open, not behind a click;
- "Priser och paket är inte publicerade ännu." (and a new rule: no price or
  "free" promise anywhere on the page).

## Changed strings

| Key                                                   | Before (sv / en)                                                                                                                                                                                                                                                                                                                              | After (sv / en)                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home.hero.subtitle`                                  | "Hitta jobb inom säkerhet, samla certifieringar och behörigheter i Security Passport och få AI-stöd i ditt dagliga säkerhetsarbete. Du bestämmer alltid vad som delas." / "Find security jobs, keep your certifications and licences in Security Passport, and get AI support in your daily security work. You always decide what is shared." | "Jobb, Security Passport och AI-stöd. Du bestämmer vad som delas." / "Jobs, Security Passport and AI support. You decide what is shared."                                                                                                            |
| value card 1 link                                     | "Skapa ditt Security Passport" / "Create your Security Passport"                                                                                                                                                                                                                                                                              | `cta.passport`: "Skapa mitt Security Passport" / "Create my Security Passport"                                                                                                                                                                       |
| `home.ai.body`                                        | "… Verktyget hjälper dig att strukturera underlag – du står för bedömningen." / "… It helps you structure material – the judgement stays yours."                                                                                                                                                                                              | "En privat arbetsyta för omvärldsbevakning och säkerhetsanalys. AI-utkast där funktionen är aktiverad – du står för bedömningen." / "A private workspace for monitoring and security analysis. AI drafts where enabled – the judgement stays yours." |
| `home.start.step.1–3` (was `person.1–3`)              | "Skapa ett konto med din e-postadress." … / "Create an account with your email address." …                                                                                                                                                                                                                                                    | "Skapa ett konto." · "Fyll i din profil." · "Sök jobb, bygg ditt Passport eller starta Career Discovery." / "Create an account." · "Complete your profile." · "Search jobs, build your Passport or start Career Discovery."                          |
| `home.markets.body`                                   | "… Du väljer själv vad du delar och med vem." / "… You decide what you share and with whom."                                                                                                                                                                                                                                                  | "Sverige är öppet. Storbritannien och Dubai är i sluten pilot." / "Sweden is open. Great Britain and Dubai are in closed pilot."                                                                                                                     |
| `home.faq.pricing` (new)                              | part of `home.faq.offer.employer`                                                                                                                                                                                                                                                                                                             | "Priser och paket är inte publicerade ännu." / "Prices and packages are not published yet."                                                                                                                                                          |
| `home.faq.ai.question` / `.answer` (were `q5` / `a5`) | "Nej. AI kan hjälpa till att strukturera underlag, men människor fattar och dokumenterar varje beslut. Plattformen rangordnar inte kandidater." / "No. AI can help structure material, but people make and document every decision. The platform does not rank candidates."                                                                   | "Nej. Människor fattar och dokumenterar varje beslut. Plattformen sorterar inte kandidater från bäst till sämst." / "No. People make and document every decision. The platform does not sort candidates best to worst."                              |

## Open for the owner

- `/contact`, linked from the FAQ, is a preview form that sends nothing — its
  own notice says so, and the footer deliberately does not link it. The link
  is kept, as the plan instructs; the guard now requires the contact page to
  keep saying so while the form sends nothing.
- The hero button spacing, job-card hyphenation, template placeholders, the
  mobile filter panel and name capitalisation (plan items 1–5) belong to the
  later coordinated design task and are untouched here.

## Evidence

- `bun run public-homepage:check` — 0 failures (was 27).
- 13 ad-hoc mutations against the guard (ranking back, superseded label back,
  over the ceiling, FAQ answer closed, decision not last, classified-info
  warning gone, Security Work linked directly, a price added, the contact
  notice gone, a non-product "product name", an eighth section, a retired key
  requested) — each fails its own named assertion.
- `e2e/public-homepage.spec.ts` updated for the layout and run in CI
  (`public-entry-browser`), which also uploads routed screenshots at
  1440 / 375 / 390 px in sv and en.
