# Information Architecture v3.0

**Status:** design. This is the UI blueprint — the buildable specification of every screen.

> **How this document relates to the others**
> [User Journey](./user-journey-v3.0.md) is the same sequence as narrative; this is the same sequence as specification. Anything shown here must be produced by something in [Evidence Architecture](./evidence-architecture-v3.0.md). The items rendered by screen S-05 are specified in the [Question Blueprint](./question-blueprint-v3.0.md); what screens S-08 to S-11 display comes from the [DNA Model](./security-career-dna-model-v3.0.md) and [Career Intelligence Mapping](./career-intelligence-mapping-v3.0.md).

---

## Route map

| Route | Screens | Auth |
|---|---|---|
| `/career-discovery` | 1–3 | anonymous |
| `/career-discovery/context` | 4 | anonymous |
| `/career-discovery/discover` | 5–7 | anonymous |
| `/career-discovery/result` | 8–15 | anonymous |
| `/my-career` | 16–17 | required |

One route per phase, not one per item — item state lives in the session, so back/forward behave and a reload resumes.

**Replaces** `/security-career-assessment`, which redirects permanently. The employer-assigned variant at `/invite/$token` reuses the same components rather than duplicating the runner as it does today (audit: two parallel implementations must be kept in sync).

---

## Screen specifications

Format: **Purpose · Primary action · Secondary action · Data collected · Evidence collected · Decision made · Transition.**

---

### S-01 Landing `[MVP]`

- **Purpose** — establish what this is and that it is worth 15 minutes
- **Primary** — Start
- **Secondary** — How it works (in-page anchor)
- **Data** — none
- **Evidence** — none
- **Decision** — none
- **Transition** — S-02

Content: one-line proposition · honest time estimate · four trust points (15 min · free · no account · answers stay yours) · three-step how-it-works.

> No countdown, no "X people took this today", no social proof the platform cannot verify.

---

### S-02 Welcome `[MVP]`

- **Purpose** — remove evaluative threat before the first question
- **Primary** — Continue
- **Secondary** — Back
- **Data** — none
- **Evidence** — none
- **Decision** — none
- **Transition** — S-03

Content: *not a test · no right answers · nothing here decides whether you can work in security · you will get a profile, an explanation, and directions worth looking at.*

---

### S-03 Expectation setting `[MVP]`

- **Purpose** — state data handling **before** collecting anything
- **Primary** — Continue
- **Secondary** — How we use your answers (panel)
- **Data** — none
- **Evidence** — none
- **Decision** — records that this version of the notice was shown
- **Transition** — S-04

Panel content, plain language: answers stay on this device until you choose to save · nothing is shared with any employer, ever · you can delete everything at any time · what the result can and cannot tell you.

> Every statement must be true at render time. Audit F-12 found the current build claims "Not stored" while persisting for signed-in users. Any claim here is a **build-blocking assertion**, not copy.

---

### S-04 Career Context `[MVP]`

- **Purpose** — tailor voice, not measurement
- **Primary** — Continue
- **Secondary** — Skip
- **Data** — C1 situation · C2 tenure (conditional) · C3 motivation
- **Evidence** — none (unscored)
- **Decision** — report voice, action-plan horizon
- **Transition** — S-05

C2 appears only when C1 ∈ {`new_in_security`, `working_in_security`}. Skip is a first-class path, not a consolation link beside a disabled button.

---

### S-05 Discovery item `[MVP]` — repeats ×20

- **Purpose** — collect one piece of evidence
- **Primary** — Next (enabled once answered)
- **Secondary** — Back · Skip · **Why are we asking this?**
- **Data** — response, response time
- **Evidence** — **one Evidence Object**
- **Decision** — none visible
- **Transition** — next item, or S-06 after item 7 and 14, or S-07 after item 20

| Element | Specification |
|---|---|
| Progress | "7 of 20" plus a bar. Honest — never rescaled to look further along |
| Item body | Topic eyebrow · prompt · options as a real radio group |
| Why-we-ask | Collapsed by default; one sentence, item-specific |
| Back | Always available; never destroys an answer |
| Skip | Always available; recorded as `declined`, distinct from `unanswered` |

**Accessibility.** Options are `role="radiogroup"` with arrow-key navigation — the current build uses `aria-pressed` buttons with no group semantics. `aria-live="polite"` announces each new item. Focus moves to the prompt on advance. Visible focus ring on every option. No colour-only state. Motion respects `prefers-reduced-motion`.

**Persistence.** Written to local storage on every change and to the server once an account exists. **Arriving at the landing route never clears an in-progress run** — the direct fix for audit F-9, where any of ~20 site-wide links silently destroys 12 minutes of work.

---

### S-06 Interstitial `[MVP]` — after items 7 and 14

- **Purpose** — give something back mid-flow; prove the system is reasoning
- **Primary** — Continue
- **Secondary** — none
- **Data** — none
- **Evidence** — none
- **Decision** — none
- **Transition** — next item

Content: one directional observation from evidence so far, plus items remaining. *"So far you're leaning toward work where you're present rather than at a distance. Six more."*

Must be **true and derived**, never a generic encouragement string. If evidence so far supports no confident statement, show remaining count only. A false interstitial is worse than none.

---

### S-07 Reflection `[MVP]`

- **Purpose** — create anticipation; capture self-prediction for later comparison
- **Primary** — Show my result
- **Secondary** — Skip
- **Data** — free text, ≤500 chars
- **Evidence** — stored verbatim, **never scored**
- **Decision** — none
- **Transition** — S-08 (via computing state)

Explicit label: *"This doesn't affect your result."*

---

### S-07b Computing `[MVP]`

- **Purpose** — cover computation honestly
- **Primary** — none
- **Secondary** — none
- **Transition** — automatic to S-08

Three named steps with real progress: *reading your answers · building your profile · matching against professions.* `role="status"` with `aria-live`. If it exceeds 5 s, say so. If it fails, offer retry **without losing answers** — the current build's error state offers "Retake", which destroys all 20.

---

### S-08 Career DNA `[MVP]`

- **Purpose** — show the person to themselves before recommending anything
- **Primary** — Continue to your narrative
- **Secondary** — expand any axis
- **Data** — none
- **Evidence** — none
- **Decision** — none
- **Transition** — S-09

Eight axes, each: name · position between two named ends · **confidence, equally prominent** · one-line meaning. Context-dependent axes shown as such. Emerging axes labelled *"we don't have a clear read yet"* and visually distinct.

> No score out of 100. No axis rendered as better at one end. No radar chart — radar shape implies an ideal profile, and there is none.

---

### S-09 Career Narrative `[MVP]`

- **Purpose** — the moment of being understood
- **Primary** — See where this points
- **Secondary** — **Why do you say that?** per paragraph `[V1]`
- **Data** — none
- **Evidence** — none
- **Decision** — none
- **Transition** — S-10

Four to six paragraphs: how they approach work · how they decide · how they respond to pressure · environments that may suit · environments that may challenge · where they may grow.

If S-07 was answered, one paragraph compares their own prediction against the evidence — the single most memorable element in the report.

Every paragraph is a deterministic template filled from licensed statements. **A statement without sufficient evidence is not emitted.** Never softened, never hedged.

---

### S-10 Career Intelligence `[MVP]`

- **Purpose** — make the profession legible before naming roles in it
- **Primary** — See recommended directions
- **Secondary** — explore any area
- **Transition** — S-11

Security Career Areas shown as fitting / adjacent / further away, each with a one-line reason. Includes an explicit **"what we don't know yet"** block naming the axis and what would resolve it.

---

### S-11 Recommendations `[MVP]`

- **Purpose** — name real professions with real requirements
- **Primary** — Explore this profession
- **Secondary** — Why this one? · Compare
- **Transition** — S-12 or profession guide

Three to five professions. Each card: name · area · **fit and confidence as separate indicators** · why it fits (top contributing signals) · what it involves · formal requirements with Swedish regulatory context · honest note on what is uncertain.

> Fit and confidence are never combined into one number. Audit F-5 — the current engine sorts on confidence-capped values, so caps silently reorder results.

Regulated professions carry the authority disclaimer verbatim from the Career Intelligence Graph.

---

### S-12 Action Plan `[MVP]`

- **Purpose** — make Monday concrete
- **Primary** — Save this
- **Secondary** — adjust horizon
- **Transition** — S-13 or S-15

Three horizons — this week · three months · longer — tailored by C1/C2/C3, which were collected at the start rather than offered as a selector at the end.

---

### S-13 Learning `[V1]` · S-14 Jobs `[V1]`

- **Purpose** — turn direction into a route, and route into opportunity
- **Transition** — S-15

Both render **honest coverage**: *"we have good information for this profession; we're still building it for that one."* Neither ships an empty section labelled "being expanded" — the current build does, in four places.

---

### S-15 Save `[MVP]`

- **Purpose** — convert at peak value
- **Primary** — Create account and save
- **Secondary** — Email me a link · Continue without saving
- **Data** — email, if chosen
- **Decision** — migrate anonymous Evidence Store to account
- **Transition** — `/my-career`, **with the report intact**

Offered **after** the full report. States what saving enables concretely: keep this · see what changes when you return · add to it over time.

> Authentication must preserve the session. Audit F-14: the current save link has no return URL, so signing in destroys the report.

---

### S-15b Your data `[MVP]`

- **Purpose** — make export and deletion real, not a support request
- **Primary** — Download my data
- **Secondary** — Delete everything · Manage consents
- **Data** — none collected
- **Decision** — export, deletion, or consent withdrawal
- **Transition** — back to origin, or to a confirmation

Reachable from the expectation-setting panel, the report footer and the account area. Shows what is held, in plain language, per [Master Blueprint §10.2](./master-product-blueprint-v3.0.md).

> **This screen is why S-03 can make its promises.** The expectation-setting screen tells the user *"you can delete everything at any time"* — that statement is only permitted to ship because this screen ships with it. Deletion includes report snapshots; immutability protects them from modification, not from erasure by the person whose data they are.

Consent withdrawal states its consequence before confirming: *"This removes those answers and recalculates your profile. Some of your result may change."*

---

### S-16 My Career hub `[V1]` · S-17 Reassessment `[V1]`

Hub: current DNA with confidence · saved reports · what changed since last visit · recommended next step.

> The Career Journey stepper is **removed** until every step can genuinely complete. Audit F-12 — two of its five steps are hardcoded `false` and it is permanently stuck at 3/5. A progress indicator that cannot finish is worse than none.

Reassessment: shorter than the first run, targeting only stale or uncertain axes, ending in an explicit before/after comparison.

---

## Required states

Every screen must specify these. The current build is missing most.

| State | Requirement |
|---|---|
| **Resume** | Detected on load, offered explicitly: *"You were 12 questions in. Continue or start over?"* Never silent, never automatic |
| **Partial** | A run with unanswered items produces a report with honest confidence, and says which axes are thin |
| **Zero result** | Cannot occur — if evidence is too thin to recommend, the DNA and narrative still render, with an explicit invitation to answer more. Never a dead end |
| **Error** | Retry without data loss. Never offer "start over" as the only option |
| **Offline** | Answers buffer locally; a banner states nothing is lost |
| **Revisit** | A saved report reopens read-only with its original snapshot, labelled with its date and model version |
| **Expired anonymous** | Local data older than 30 days prompts before use |

---

## Cross-cutting standards

**Internationalisation.** Every string comes from the dictionary. Zero inline `lang === "sv" ? … : …` ternaries — the current report is 1857 lines with none of its copy translatable (audit F-11). Swedish and English reach approval independently; a language is not offered until its adaptation is approved.

**Accessibility.** WCAG 2.2 AA. Real radio groups. Live regions on every content change. Focus management on navigation. Visible focus throughout. No colour-only encoding. `prefers-reduced-motion` respected. Full keyboard path from landing to report.

**Never rendered.** Engine version or model identifiers · raw axis numbers without confidence · unbuilt features as "coming soon" · any claim not true at render time · comparison to other people.

**Mobile.** Every screen is designed at 375 px first. One item per screen with a thumb-reachable primary action. The report is a single column — no side-by-side comparison that collapses into unreadable stacking.
