# AI and human oversight

Spec chapter 10, plus chapters 3.2, 9.2 and 12.

## The boundary

**AI explains. Deterministic rules calculate. Humans decide.**

No AI is used anywhere in the Security Competency Platform today. Nothing in PR-A calls a model. This document exists so the boundary is written down before anyone is tempted to cross it, not because something already does.

## What AI may do (later, once the controls below exist)

- Summarise approved competency descriptions
- Select from a pre-approved library of development statements
- Generate structured interview questions from an approved rule library
- Explain the difference between Core and a profession module
- Flag that human review is required
- Translate text through the approved adaptation process
- Produce draft content for human review

## What AI may never do

- Create pass/fail, ranking, or a hiring/rejection recommendation
- Infer diagnosis, mental health, criminal propensity, loyalty, ideology, or any protected or sensitive characteristic
- Perform emotion, face, voice or biometric inference
- Change, correct or influence a score
- Publish an item
- Hide uncertainty or validation status
- Use a candidate's name, photograph or background as an interpretation signal

## Structural guarantees

The schema has **no column an AI could write a decision into**. Scores live in `score_results` (PR-D), written only by the scoring service from a locked, hashed payload. Any future AI narrative is a separate, additive field that sits alongside the deterministic result and can never replace it.

Every AI output touching an assessment result must be traceable to the specific evidence underlying it. An explanation that cannot be traced back to concrete competency and item-level results is not an explanation — it is a hallucination risk, and must not ship.

## Prohibited report language

These must be blocked or routed for review whenever used as a categorical statement about a person, whether generated deterministically or by a model:

> lämplig / olämplig · suitable / unsuitable · hire / reject · pålitlig / opålitlig · trustworthy / untrustworthy · "kommer att prestera" / "will perform" · "saknar empati" · "är stresstålig" · "hög risk för illojalitet" / "high risk of disloyalty" · guaranteed performance

Permitted framing is a behavioural hypothesis bounded by the test: *"Resultatet tyder på … i de testade situationerna."*

Automated guards land in PR-E.

## Human oversight in the product

No employer workflow may automatically approve, reject or rank a candidate from a score, and no automatic write path from a score to application status exists (acceptance criteria 8, 14; spec T-008). A real person must make a meaningful assessment, be able to disagree with the test, and document their decision (GDPR Article 22; IMY guidance).

## Planned AI architecture, when it is scoped

1. Scoring service produces a signed score payload.
2. Policy engine checks validation status, intended use and permitted report statements.
3. Narrative engine selects deterministic or AI-assisted wording from an approved library.
4. Human oversight layer shows source score, version and uncertainty, and forbids automatic candidate status change.
5. Audit layer logs input schema version, model version, prompt version, output and human viewing — without exposing scoring keys.
