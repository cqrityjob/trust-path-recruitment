# Security Career Discovery v3.0 — Executive Summary

*One page. Five questions.*

*Full documentation: [README](./README.md) · [Master Product Blueprint](./master-product-blueprint-v3.0.md) · [The Experience](./security-career-discovery-experience.md) · [Implementation Roadmap](./implementation-roadmap-v3.0.md)*

---

## Why will users trust this product?

Because trust is built into the architecture rather than asserted in the copy.

The product tells a person **what it is asking and why** before each question, **what it does with the answer** before collecting any, **how certain it is** beside every conclusion, and **what it does not know** — specifically, by name, with the shortest route to resolving it. Every statement in the report resolves to the answers that licensed it, and a statement without sufficient evidence is not emitted at all. Silence, not hedging.

It also refuses things. It will not assign a personality type. It will not produce a score out of 100. It will not compare someone to other people. It will not let an employer see the private profile — not as policy, but as a structural property of the schema. Each refusal costs something, and that is precisely why it is credible.

The user gets the full result before being asked to register. Value first, always.

---

## Why will employers trust this product?

Because the separation protecting the candidate is the same separation that makes the employer product defensible.

Career Discovery and the Security Competency Platform are **different construct families with different vocabularies, different items and different scoring**. An employer's competence measurement cannot silently become a career claim, and a candidate's private career profile cannot leak into a hiring decision. Enforced by database triggers that fire for every caller including service-role and raw SQL, and by CI guards that fail the build on violation.

For the employer product itself: no pass/fail, no ranking, no suitability classification, no automatic path from a score to an application status. Published content is immutable and versioned, so a result is reproducible years later against the exact instrument that produced it. Every assessment carries an honest validation status, and the platform refuses to describe anything as validated before its release gates are met.

An employer relying on this is relying on something that will survive scrutiny — from a candidate, a regulator, or a court.

---

## Why is this difficult for competitors to copy?

Some of it is not. The questions could be copied in a week, the interface in a month, the report structure in a quarter.

Four things cannot:

**The Swedish security taxonomy.** Fourteen canonical families, sixty-seven professions, real regulatory grounding, authority disclaimers for police and defence. Years of domain work requiring security expertise and regulatory accuracy — and it does not generalise across borders, so each market must be rebuilt.

**The compounding evidence store.** A profile that improves with every interaction only works if evidence accumulates from the first day. A competitor who computes-and-discards cannot retrofit it; they must rebuild the engine and start their history at zero.

**The two-sided consent architecture.** Employer assessments strengthening a candidate's own profile requires both sides of the marketplace, a construct separation keeping competence and orientation distinct, and consent that genuinely revokes. A single-sided product cannot do it at any price.

**The refusals.** Every trust position above is something given up. Competitors whose positioning depends on appearing authoritative cannot admit uncertainty. Competitors whose customer is the employer cannot give the profile to the candidate.

---

## Why is this a scalable SaaS business?

The expensive parts are built once and reused.

The **eight orientation axes are domain-general** — they apply to cyber, AML, crisis management and military work as directly as to protective operations. Ten of the twelve target domains already have a canonical family. Adding a domain is content: profession profiles and enrichment. **No new construct, no new item type, no engine change.**

Internationalisation is the same shape. Professions carry a market, regulatory content carries a jurisdiction, language is an adaptation object with its own approval status. A new country adds professions and an approved adaptation. The axes do not change, because how a person orients toward work is not Swedish — only what is regulated, and by whom.

The unit economics improve with use. Marginal cost per assessment is near zero, while the value of each rises as the taxonomy deepens and the evidence base grows. The candidate side drives acquisition and retention at low cost; the employer side monetises. The Career DNA is the asset that makes both sides worth more over time.

---

## Why is this aligned with *"Where trust comes first"*?

Because in this product, trust is not the marketing — it is the constraint that produced every significant design decision.

Trust is why the person owns the profile and the employer cannot see it. Why the platform says what it does not know instead of appearing authoritative. Why nobody gets a type or a label. Why every claim traces to evidence and unsupported claims are withheld rather than softened. Why consent is explicit, purpose-specific and revocable, and flows one way only. Why the report comes before the registration prompt. Why nothing unbuilt is ever shown. Why motivation comes from delivered value and never from manipulation.

Each of those made the product harder to build and slower to launch. That is what makes the claim true.

A platform whose business is helping people be trusted has to be trustworthy in a way that is checkable — not stated. This document set specifies a product where a user, an employer or a regulator can follow any claim back to the evidence that licensed it.

**Trust comes first because it is load-bearing. Remove it and the product does not stand up.**
