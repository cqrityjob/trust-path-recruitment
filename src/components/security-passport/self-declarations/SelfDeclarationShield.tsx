// A voluntary self-declaration, as a shield.
//
// ── WHAT IT MAY SAY ─────────────────────────────────────────────────────
//
// It reuses the Passport's own shield primitive in its SELF-DECLARED
// treatment -- the dashed outline, no glyph -- and that treatment is fixed
// here: there is no prop that selects another one. So a supporting document,
// or an appointed reviewer's note about that document, can never draw a tick,
// a verified rim or any stronger state. The label is always
// "<subject> · Självdeklarerat".
//
// Opening it shows the exact statement the person affirmed (the versioned
// wording, with its date), its date, jurisdiction and scope, and -- always --
// that the person made the statement themself and CQrityjob has not verified
// it. For the HOLDER only, the existing provenance description is repeated in
// its own precise words ("Document provided ... nobody has reviewed it").
//
// It is not a credential and is never rendered among them: it takes a
// `DisclosedStatement`, not a claim, and nothing here reads sp_claims.
//
// A statement whose wording this application does not hold renders nothing.

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { L, Lf, type Lang } from "@/components/professional-identity/copy";
import { ShieldMark } from "@/components/security-passport/CredentialShield";
import {
  JURISDICTION_NAME,
  PROVENANCE,
  SHIELD,
  SHIELD_SUBJECT,
  STATEMENTS,
} from "@/lib/self-declarations/copy";
import type { Provenance } from "@/lib/self-declarations/model";
import type { DisclosedStatement } from "@/lib/self-declarations/passport-bridge";

/** "<subject> · Självdeklarerat". The one label, in one place. */
export function selfDeclarationShieldLabel(statement: DisclosedStatement, lang: Lang): string {
  return `${L(SHIELD_SUBJECT[statement.kind], lang)} · ${L(SHIELD.selfDeclared, lang)}`;
}

export function SelfDeclarationShield({
  statement,
  lang,
  holderProvenance,
  defaultOpen = false,
}: {
  readonly statement: DisclosedStatement;
  readonly lang: Lang;
  /** The holder's own view only. A recipient is never given a provenance. */
  readonly holderProvenance?: Provenance;
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const wording = STATEMENTS[statement.statementVersion];
  if (!wording) return null;

  const label = selfDeclarationShieldLabel(statement, lang);
  const jurisdiction = JURISDICTION_NAME[statement.jurisdiction];

  return (
    <div
      className="min-w-0 rounded-xl border border-border bg-card"
      data-vsd-shield={statement.kind}
      data-vsd-shield-state="self_declared"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ShieldMark state="self_declared" size={36} />
        <span className="min-w-0 flex-1">
          <span
            className="block break-words text-sm font-semibold text-foreground"
            data-vsd-shield-label
          >
            {label}
          </span>
          <span className="block text-xs text-muted-foreground">
            {Lf(SHIELD.about, lang, statement.asOfDate)}
          </span>
          <span className="sr-only">. {L(open ? SHIELD.hide : SHIELD.show, lang)}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={label}
          className="border-t border-border p-3 sm:p-4"
          data-vsd-shield-detail
        >
          <p className="max-w-[65ch] text-sm leading-relaxed text-foreground" data-vsd-statement>
            {Lf(wording.statement, lang, statement.asOfDate)}
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">{L(SHIELD.statementDate, lang)}</dt>
            <dd className="text-foreground" data-vsd-shield-date>
              {statement.asOfDate}
            </dd>
            <dt className="text-muted-foreground">{L(SHIELD.jurisdiction, lang)}</dt>
            <dd className="text-foreground">
              {jurisdiction ? L(jurisdiction, lang) : statement.jurisdiction}
            </dd>
            {statement.statementPeriod ? (
              <>
                <dt className="text-muted-foreground">{L(SHIELD.period, lang)}</dt>
                <dd className="text-foreground">{statement.statementPeriod}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{L(SHIELD.scope, lang)}</dt>
            <dd className="max-w-[65ch] text-foreground">{L(wording.scope, lang)}</dd>
            <dt className="text-muted-foreground">{L(SHIELD.madeOn, lang)}</dt>
            <dd className="text-foreground">{statement.declaredOn}</dd>
            {holderProvenance && holderProvenance !== "self_declared" ? (
              <>
                <dt className="text-muted-foreground">{L(SHIELD.support, lang)}</dt>
                <dd className="max-w-[65ch] text-foreground" data-vsd-shield-support>
                  {L(PROVENANCE[holderProvenance].label, lang)}.{" "}
                  {L(PROVENANCE[holderProvenance].hint, lang)}
                </dd>
              </>
            ) : null}
          </dl>
          <p
            className="mt-3 max-w-[65ch] rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
            data-vsd-shield-unverified
          >
            {L(SHIELD.notVerified, lang)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The shields for a set of statements, in the fixed order they arrive. */
export function SelfDeclarationShieldList({
  statements,
  lang,
  defaultOpen = false,
}: {
  readonly statements: readonly DisclosedStatement[];
  readonly lang: Lang;
  readonly defaultOpen?: boolean;
}) {
  return (
    <ul className="grid gap-3" data-vsd-shield-list>
      {statements.map((statement) => (
        <li key={`${statement.kind}:${statement.jurisdiction}`} className="min-w-0">
          <SelfDeclarationShield statement={statement} lang={lang} defaultOpen={defaultOpen} />
        </li>
      ))}
    </ul>
  );
}
