// Security Passport — the four ways this product was lying to a candidate.
//
// Run via `bun run passport-decision-truthfulness:check`.
//
// ── WHAT WAS WRONG ─────────────────────────────────────────────────────
//
// Four separate defects, one shape. In each of them something happened —
// a reviewer refused a credential, a query was rejected, a decision log
// could not be read — and the interface presented the result as a calm,
// well-formed nothing:
//
//   F1  A rejected request stopped being "open", so the entire status block
//       disappeared. The reviewer's message went with it, and the holder was
//       shown the same "Request verification" button they had pressed. The
//       decision was invisible, and the interface said nothing had happened.
//
//   F2  `getMyPassport` checked two of its five reads. A refused claims query
//       became `[]`, a refused periods query became `[]`, a failed event count
//       became `0`. A holder with three verified credentials and a broken
//       connection read "0 verifierade" about their own professional standing.
//
//   F4  `sp_verifier_decide` accepted 'rejected' and 'clarification_requested'
//       with no candidate-facing reason, so "Komplettering begärd" could be
//       the whole message — a demand for an action it does not describe.
//
//   F9  `listMyVerificationRequests` checked the requests query and ignored
//       the decisions query, returning a believable history in which every
//       request was decided and no decision existed.
//
// ── WHY IT RENDERS RATHER THAN ONLY READS ──────────────────────────────
//
// F1 is a property of what a candidate SEES. A `rejectedRequest` prop that is
// computed correctly and then rendered by nothing would pass any source scan
// and fix nothing, which is the gap `passport-pilot-bugfix-check` and
// `my-career-experience-check` exist to close for their own surfaces. So the
// panel is rendered for real and the markup is asserted.
//
// F2, F4 and F9 are properties of server functions, which cannot be rendered
// and must not be called from a guard script — they need a database and an
// authenticated session. Those are asserted from source, deliberately with
// comments stripped, because the prose in these files DISCUSSES the very
// patterns being banned.
//
// ── SWEDISH IS WHAT IS RENDERED ────────────────────────────────────────
//
// `I18nProvider` starts at "sv" on the server and exposes no way to seed a
// locale, so Swedish is what the markup contains. The English half of every
// sentence is asserted from the copy module directly, and
// `passport-fixture-check` holds sv/en parity across the whole table.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { VerificationPanel } from "../src/components/security-passport/live/VerificationPanel";
import { EvidencePanel } from "../src/components/security-passport/live/EvidencePanel";
import { passportT, type PassportCopyKey } from "../src/lib/security-passport/i18n";
import {
  DECISION_ERROR_CODES,
  classifyDecisionError,
} from "../src/lib/security-passport/decision-errors";
import type {
  MyVerificationRequest,
  VerificationDecisionRecord,
} from "../src/lib/security-passport/verification.functions";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** These files EXPLAIN the anti-patterns they no longer commit, at length. A
 *  naive scan reads the explanation as the offence. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const sv = (k: PassportCopyKey) => passportT(k, "sv");
const noopAsync = async () => {};

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** The internal reviewer note. It is not on `MyVerificationRequest` and this
 *  guard could not pass it as a prop if it tried — which is the point. It is
 *  searched for in the markup as a literal so that a future change which
 *  widens the payload to carry it is caught here rather than by a candidate. */
const INTERNAL_NOTE = "INTERNAL: scan is illegible, reviewer suspects a crop";
const HOLDER_REASON = "The uploaded certificate does not show the required training level.";
const CLARIFY_REASON = "Please upload the page showing the certificate number.";

function request(over: Partial<MyVerificationRequest> = {}): MyVerificationRequest {
  return {
    id: "req-1",
    claimId: "claim-1",
    periodId: null,
    kind: "cqrityjob_review",
    status: "pending",
    submittedAt: "2026-08-01T09:00:00Z",
    decidedAt: null,
    method: null,
    holderMessage: null,
    validFrom: null,
    validUntil: null,
    targetEmployerId: null,
    ...over,
  };
}

const REJECTED = request({
  status: "rejected",
  decidedAt: "2026-08-20T11:30:00Z",
  method: "document_review",
  holderMessage: HOLDER_REASON,
});

const CLARIFYING = request({
  status: "clarification_requested",
  decidedAt: "2026-08-20T11:30:00Z",
  holderMessage: CLARIFY_REASON,
});

function panel(over: Partial<React.ComponentProps<typeof VerificationPanel>> = {}): string {
  return html(
    <VerificationPanel
      assertionLevel="document_provided"
      validity={
        {
          effectiveState: "active",
          hasExpired: false,
          expiresSoon: false,
          daysRemaining: null,
        } as never
      }
      openRequest={null}
      rejectedRequest={null}
      requests={[]}
      decisions={[] as readonly VerificationDecisionRecord[]}
      hasEvidence
      canAskEmployer={false}
      employers={[]}
      onSubmit={noopAsync}
      onWithdrawRequest={noopAsync}
      onDispute={noopAsync}
      {...over}
    />,
  );
}

console.log("passport-decision-truthfulness-check\n");

/* ══════════════════════════════════════════════════════════════════════
   F1 — A REJECTION IS VISIBLE
   ══════════════════════════════════════════════════════════════════════ */
group("F1 -- the rejection that used to disappear");
{
  const markup = panel({ rejectedRequest: REJECTED, requests: [REJECTED] });

  ck(
    "the outcome is stated, in words, as its own heading",
    markup.includes(sv("ver.rejected.title")),
  );
  ck(
    "and explained -- what could not be verified, and on what basis",
    markup.includes(sv("ver.rejected.body")),
  );
  ck("the reviewer's message to the candidate is rendered", markup.includes(HOLDER_REASON));
  ck(
    "the reason is labelled as the reviewer's, not left as loose text",
    markup.includes(sv("ver.rejected.reason")),
  );
  ck("the decision date is shown when the payload carries one", markup.includes("2026-08-20"));
  ck("there is a stated next step", markup.includes(sv("ver.rejected.next")));

  // THE ORIGINAL DEFECT, stated as its own assertion: the panel must not come
  // back reading exactly as it did before the holder ever submitted.
  ck(
    "the naked first-time submit copy does NOT reappear as if nothing happened",
    !markup.includes(sv("ver.requestCq")) && !markup.includes(sv("ver.requestCqHelp")),
  );
  ck(
    "what is offered instead is a NEW review, named as one",
    markup.includes(sv("ver.resubmit.title")) && markup.includes(sv("ver.resubmit.action")),
  );

  // ── The state is carried by words, not by colour ──────────────────
  ck(
    "the decision is announced to assistive technology as a status region",
    /role="status"/.test(markup),
  );

  // ── PRIVACY: the internal note can never be here ──────────────────
  const withNote = panel({
    rejectedRequest: { ...REJECTED, decisionNote: INTERNAL_NOTE } as never,
    requests: [REJECTED],
  });
  ck(
    "the internal reviewer note is not rendered even when smuggled onto the prop",
    !withNote.includes(INTERNAL_NOTE) && !withNote.includes("INTERNAL:"),
  );

  // ── A rejection with no reason says so, rather than inventing one ──
  const noReason = panel({
    rejectedRequest: { ...REJECTED, holderMessage: null },
    requests: [REJECTED],
  });
  ck(
    "a historical rejection with no recorded reason says the reason is missing",
    noReason.includes(sv("ver.rejected.noReason")),
  );

  // ── A settled rejection does not resurrect over a later approval ──
  ck(
    "with no current rejection the rejected block does not render at all",
    !panel({ requests: [REJECTED] }).includes(sv("ver.rejected.title")),
  );

  for (const lang of ["sv", "en"] as const) {
    const s = passportT("ver.rejected.title", lang) + " " + passportT("ver.rejected.body", lang);
    // The decision is about a piece of evidence, not about a person.
    ck(
      `${lang}: the wording judges the evidence, not the candidate`,
      !/\b(unsuitable|olämplig|avvisad person|rejected candidate|underkänd person)\b/i.test(s),
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   CLARIFICATION IS ACTIONABLE
   ══════════════════════════════════════════════════════════════════════ */
group("Clarification -- what the reviewer needs, and what to do about it");
{
  const markup = panel({ openRequest: CLARIFYING, requests: [CLARIFYING] });

  ck(
    "the state is stated as a sentence, not as a two-word demand",
    markup.includes(sv("ver.clarification.title")),
  );
  ck(
    "what the reviewer needs is labelled as such",
    markup.includes(sv("ver.clarification.whatIsNeeded")),
  );
  ck("and the reviewer's actual words are rendered", markup.includes(CLARIFY_REASON));
  ck("there is an action the holder can take", markup.includes(sv("ver.clarification.action")));
  ck("it is announced to assistive technology", /role="status"/.test(markup));

  const noMessage = panel({
    openRequest: { ...CLARIFYING, holderMessage: null },
    requests: [CLARIFYING],
  });
  ck(
    "a clarification with no recorded explanation says so, and does not stand alone",
    noMessage.includes(sv("ver.clarification.noMessage")),
  );

  // ── The action has to be POSSIBLE ─────────────────────────────────
  // A reviewer asking for a document while the upload control is switched off
  // is the defect this half closes.
  const openReview = html(
    <EvidencePanel
      evidence={[]}
      canAdd
      canRemove={false}
      onUpload={noopAsync}
      onOpen={noopAsync}
      onWithdraw={noopAsync}
    />,
  );
  ck("a document can still be attached while a review is open", openReview.includes(sv("ev.add")));
  ck(
    "and the panel says why removal is unavailable rather than leaving a gap",
    openReview.includes(sv("ev.addOnlyUnderReview")),
  );

  const entryRoute = code(read("src/routes/_authenticated.passport.entry.$kind.$entryId.tsx"));
  ck(
    "the entry route separates adding evidence from removing it",
    /canAdd=\{true\}/.test(entryRoute) && /canRemove=\{openRequest === null\}/.test(entryRoute),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   F2 — THE PASSPORT READ FAILS TRUTHFULLY
   ══════════════════════════════════════════════════════════════════════ */
group("F2 -- a failed read is not an empty Passport");
{
  const src = code(read("src/lib/security-passport/passport.functions.ts"));
  const body = src.slice(src.indexOf("export const getMyPassport"), src.indexOf("/* Writes"));

  for (const res of ["profileRes", "periodsRes", "claimsRes", "eventsRes", "rulesRes"]) {
    ck(
      `${res} failure is surfaced, not coalesced away`,
      new RegExp(`if \\(${res}\\.error\\) throw new Error\\(${res}\\.error\\.message\\);`).test(
        body,
      ),
    );
  }

  // The specific false sentence: "0 verified credentials" produced by a broken
  // claims query. It is impossible only while the throw above the coalesce
  // stays above it.
  const claimsThrowAt = body.indexOf("if (claimsRes.error)");
  const claimsCoalesceAt = body.indexOf("claimsRes.data ?? []");
  ck(
    "the claims check runs BEFORE the empty-array fallback it protects",
    claimsThrowAt !== -1 && claimsCoalesceAt !== -1 && claimsThrowAt < claimsCoalesceAt,
  );
  const periodsThrowAt = body.indexOf("if (periodsRes.error)");
  const periodsCoalesceAt = body.indexOf("periodsRes.data ?? []");
  ck(
    "the periods check runs BEFORE its fallback too",
    periodsThrowAt !== -1 && periodsCoalesceAt !== -1 && periodsThrowAt < periodsCoalesceAt,
  );

  // ── And My Career already knows what to do with a rejection ───────
  // The reader can only tell the truth if its caller distinguishes an error
  // from an empty result. The home's Passport pillar is built by the
  // presentation model from the identity seam's own `unavailable` list, and
  // renders "could not be read" -- never a count -- when the Passport or
  // claims read did not answer.
  const model = code(read("src/lib/professional-identity/home-presentation.ts"));
  ck(
    "the home's Passport summary is unavailable when the Passport or claims read failed",
    /!known\("passport"\) \|\| !known\("claims"\) \|\| !counts\.known/.test(model),
  );
  ck(
    "and when the merit counts could not be established",
    /counts\.known/.test(model) &&
      code(read("src/lib/professional-identity/passport-merits.ts")).includes(
        "if (!known) return UNKNOWN;",
      ),
  );
  const summary = code(read("src/components/professional-identity/PassportSummary.tsx"));
  ck(
    "and the card renders an unavailable state rather than counting to zero",
    /passport\.state === "unavailable" \? \(/.test(summary) &&
      summary.includes("L(PASSPORT.unreadable, l)"),
  );
  ck(
    "an unanswered review read renders as a skeleton, not as a zero and not as a failure",
    /passport\.state === "loading" \? \(/.test(summary),
  );
  const homeCopy = read("src/components/professional-identity/home-copy.ts");
  const unreadable = /unreadable: c\(\s*"([^"]+)",\s*"([^"]+)",/.exec(homeCopy);
  ck(
    "the unavailable copy does not contain a merit count",
    Boolean(unreadable) && !/\b0\b/.test(unreadable![1]!) && !/\b0\b/.test(unreadable![2]!),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   F9 — DECISION HISTORY CANNOT SILENTLY EMPTY
   ══════════════════════════════════════════════════════════════════════ */
group("F9 -- a verified credential cannot lose its decision");
{
  const src = code(read("src/lib/security-passport/verification.functions.ts"));
  const body = src.slice(
    src.indexOf("export const listMyVerificationRequests"),
    src.indexOf("const submitInput"),
  );

  ck(
    "the requests read is checked",
    /if \(reqRes\.error\) throw new Error\(reqRes\.error\.message\);/.test(body),
  );
  ck(
    "the DECISIONS read is checked -- the half that was missing",
    /if \(decRes\.error\) throw new Error\(decRes\.error\.message\);/.test(body),
  );
  ck(
    "both checks precede the mapping that would have produced an empty history",
    body.indexOf("if (decRes.error)") < body.indexOf("decRes.data ?? []"),
  );

  // ── Attribution fields are still carried in full ──────────────────
  // The future model has to distinguish CQrityjob document review from an
  // employer confirmation from an issuer's own word. Nothing here may drop the
  // fields that make those different facts.
  for (const field of [
    "decider_organisation",
    "verification_method",
    "decided_at",
    "valid_from",
    "valid_until",
  ]) {
    ck(`the decision's ${field} still crosses to the client`, body.includes(field));
  }
  ck(
    "and the request still carries its kind, so review and attestation stay distinct",
    body.includes("request_kind"),
  );
  ck(
    "the internal decision_note is still absent from the holder's payload",
    !body.includes("decision_note"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   F4 — A REFUSAL MUST SAY WHY
   ══════════════════════════════════════════════════════════════════════ */
group("F4 -- rejection and clarification require a candidate-facing reason");
{
  const fn = code(read("src/lib/security-passport/verification.functions.ts"));
  const decide = fn.slice(fn.indexOf("export const decideVerification"));

  ck(
    "the server function refuses a rejection or clarification with no message",
    /decision === "rejected"[\s\S]{0,200}holder_message_required/.test(decide) ||
      /holder_message_required/.test(decide),
  );
  ck("whitespace does not count as a reason", /holderMessage\.trim\(\) === ""/.test(decide));
  ck(
    "the internal note is NOT required -- two fields, two rules",
    !/decisionNote[\s\S]{0,120}decision_note_required/.test(decide),
  );
  ck(
    "approval still requires a method, unchanged",
    /decision === "approved" && !data\.method/.test(decide),
  );

  // ── The database is the layer that actually enforces it ───────────
  const mig = read("supabase/migrations/20261012090000_sp_decision_requires_holder_message.sql");
  ck(
    "sp_verifier_decide raises SP_DECISION_REQUIRES_HOLDER_MESSAGE",
    mig.includes("SP_DECISION_REQUIRES_HOLDER_MESSAGE"),
  );
  ck(
    "the database's emptiness test covers tabs and newlines, not only spaces",
    mig.includes("[^[:space:]]"),
  );
  ck(
    "the migration does not require the internal decision_note",
    !/_decision_note IS NULL/.test(mig),
  );
  // The guards that must not have been lost in the CREATE OR REPLACE rewrite.
  for (const guard of [
    "SP_SELF_VERIFICATION_FORBIDDEN",
    "SP_NOT_VERIFIER",
    "SP_NOT_EMPLOYER_REPRESENTATIVE",
    "SP_REQUEST_ALREADY_DECIDED",
    "SP_REQUEST_NOT_FOUND",
  ]) {
    ck(`the rewritten function still carries ${guard}`, mig.includes(guard));
  }
  ck(
    "and anon still cannot execute it",
    /REVOKE ALL ON FUNCTION public\.sp_verifier_decide[\s\S]{0,80}anon/.test(mig),
  );

  // ── The refusal reaches the reviewer as a specific sentence ───────
  ck(
    "the refusal has its own classified code",
    (DECISION_ERROR_CODES as readonly string[]).includes("holder_message_required"),
  );
  ck(
    "the database's message classifies to it rather than to 'unknown'",
    classifyDecisionError("SP_DECISION_REQUIRES_HOLDER_MESSAGE") === "holder_message_required",
  );
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the reviewer is told what to write, not merely that it failed`,
      passportT("vq.decline.holder_message_required", lang).trim().length > 40,
    );
  }

  // ── And the reviewer form asks for it before the refusal happens ──
  const queue = code(read("src/routes/_authenticated.passport-review.tsx"));
  ck("the reviewer form validates it client-side", /holderMessage\.trim\(\) === ""/.test(queue));
  ck(
    "the obligation is marked on the field, for a screen reader too",
    /aria-required=\{holderMessageRequired\}/.test(queue),
  );
  ck(
    "and it is required for exactly the two outcomes that need it",
    /decision === "rejected" \|\| decision === "clarification_requested"/.test(queue),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ISSUER IS NOT VERIFIER
   ══════════════════════════════════════════════════════════════════════ */
group("Attribution -- none of the new copy calls the issuer a verifier");
{
  // The candidate typed the issuer's name. Nothing added here may present that
  // as the organisation that VERIFIED the credential; those become separate
  // trust sources in the model this product is heading towards, and collapsing
  // them now is what makes that harder later.
  const NEW_KEYS: PassportCopyKey[] = [
    "ver.rejected.title",
    "ver.rejected.body",
    "ver.rejected.reason",
    "ver.rejected.noReason",
    "ver.rejected.next",
    "ver.resubmit.title",
    "ver.resubmit.help",
    "ver.resubmit.action",
    "ver.clarification.title",
    "ver.clarification.whatIsNeeded",
    "ver.clarification.noMessage",
    "ver.clarification.action",
    "ev.addOnlyUnderReview",
  ];
  for (const lang of ["sv", "en"] as const) {
    for (const key of NEW_KEYS) {
      const s = passportT(key, lang);
      ck(`${lang}: ${key} exists and is a real sentence`, s.trim().length > 0 && s !== key);
    }
    ck(
      `${lang}: no new sentence attributes verification to an issuer`,
      !NEW_KEYS.some((k) =>
        /verifierad av utfärdare|verified by the issuer/i.test(passportT(k, lang)),
      ),
    );
  }

  // The rendered rejection must not name an organisation at all: nobody
  // verified anything, so there is no verifier to attribute.
  const markup = panel({ rejectedRequest: REJECTED, requests: [REJECTED] });
  ck(
    "the rejection block does not claim a verifying organisation",
    !markup.includes(sv("ver.decidedBy")),
  );
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`passport-decision-truthfulness-check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-decision-truthfulness-check: all assertions passed.");
