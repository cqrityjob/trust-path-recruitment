// Security Passport — everything a recipient sees, as one component.
//
// ── WHY THE PREVIEW AND THE PUBLIC PAGE ARE THE SAME FILE ──────────────
//
// A holder is asked to decide what a stranger may see. That decision is only
// as good as the picture they were shown when they made it, and the surest
// way to make the picture wrong is to build it twice: a "preview" that
// approximates the real page drifts from it on the first edit either side,
// and the drift is invisible until somebody has already sent the link.
//
// So there is no preview component. `/p/$token` renders this, and the
// sharing screen renders this, from a `RecipientPresentation` built by
// `buildRecipientPresentation` out of a payload the SAME database function
// assembled (`sp_selected_merits_payload`, reached through
// `sp_get_disclosure` for the live link and `sp_preview_selected_disclosure`
// for the preview). Nothing here knows which of the two it is looking at
// beyond the two cosmetic props below.
//
// ── LANGUAGE IS THE SHARE'S, NOT THE READER'S ──────────────────────────
//
// Every other Passport surface takes the language from the reader's own
// preference, which is right when the reader is the account holder. A share
// is different: the holder knows which language the person they are sending
// it to reads, and the recipient is a stranger with no preference stored
// here at all. So the share's own `locale` decides.
//
// It arrives as one `PassportLangProvider` around the whole subtree rather
// than as a prop, because everything below — the card, the credential list,
// the assertion chip, the lifecycle chip, the scope line — resolves its own
// copy. A prop would have to reach all of them, and the first one it missed
// would render the reader's language in the middle of the recipient's page.

import { ExternalLink, ShieldCheck } from "lucide-react";
import type { PassportLang } from "@/lib/security-passport/i18n";
import { PassportLangProvider, usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  formatDuration,
  formatPeriodRange,
  formatWorkLocation,
} from "@/lib/security-passport/format";
import { joinTitles } from "@/lib/security-passport/identity/presentation";
import { describeTrust, employmentTrustLine } from "@/lib/security-passport/trust-presentation";
import { LIVE_PACKAGES } from "@/lib/security-passport/packages";
import type { RecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { RecipientPassportCard } from "./RecipientPassportCard";
import { RecipientCredentialList } from "./RecipientCredentialList";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

export interface RecipientPassportViewProps {
  readonly presentation: RecipientPresentation;
  readonly lang: PassportLang;
  /** When the page last re-read the record. Blank until the read returns. */
  readonly checkedAt: string;
  /** The address a recipient can return to. Never this page's own URL — see
   *  the note in p.$token.tsx. */
  readonly verifyUrl: string;
  /** True when the sharing screen is rendering it. Changes NOTHING about
   *  what is shown; it only suppresses the marketing footer, which is the one
   *  block addressed to a stranger rather than about the holder. */
  readonly preview?: boolean;
}

export function RecipientPassportView(props: RecipientPassportViewProps) {
  return (
    <PassportLangProvider lang={props.lang}>
      <RecipientPassportBody {...props} />
    </PassportLangProvider>
  );
}

function RecipientPassportBody({
  presentation,
  checkedAt,
  verifyUrl,
  preview = false,
}: RecipientPassportViewProps) {
  // Inside the provider, so this is the SHARE's language, not the reader's.
  const { pt, lang } = usePassportCopy();
  const meta = LIVE_PACKAGES.find((p) => p.code === presentation.packageCode);

  return (
    <div data-recipient-view className="mx-auto max-w-3xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("rec.brand")}
        </p>
        <h1
          className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("rec.title")}
        </h1>

        {/* Said before any content: this page — not a screenshot of it — is
            the current position. */}
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {pt("rec.authoritative")}
        </p>

        {/* What a share IS, in one sentence, before the reader has to
            interpret a single label. */}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{pt("rec.whatThisIs")}</p>

        {/* How long this view is good for, said where a reader decides
            whether to act on it rather than buried in the detail grid. */}
        {presentation.expiresAt ? (
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            {pt("rec.linkExpires")}: {presentation.expiresAt.slice(0, 10)}
          </p>
        ) : null}
      </header>

      {/* ── The trust legend ────────────────────────────────────────────
          Three words, said once, in plain language, before the merits that
          wear them. A reader who meets "Dokumenterad" beside a credential
          with no explanation supplies their own, and what they supply is
          always more than the record supports. */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {pt("rec.legendTitle")}
        </h2>
        <dl className="mt-3 space-y-3">
          {(
            [
              ["trust.level.self_declared", "rec.legend.self_declared"],
              ["trust.level.documented", "rec.legend.documented"],
              ["trust.level.source_verified", "rec.legend.source_verified"],
            ] as const
          ).map(([word, body]) => (
            <div key={word}>
              <dt className="text-sm font-medium text-foreground">{pt(word)}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{pt(body)}</dd>
            </div>
          ))}
        </dl>
        {/* The distinction §G of the brief turns on, stated rather than
            implied by the absence of a word. */}
        <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
          {pt("rec.legend.employmentNote")}
        </p>
      </section>

      <section className="mt-6" aria-label={pt("rec.cardTitle")}>
        <RecipientPassportCard presentation={presentation} verifyUrl={verifyUrl} />
      </section>

      {presentation.containsExpired ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {pt("rec.expiredNotice")}
        </p>
      ) : null}

      {/* ── What the share contains ─────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {pt("rec.detailsTitle")}
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <Row
            label={pt("rec.holder")}
            value={presentation.holderLabel ?? pt("rec.anonymousHolder")}
          />
          <Row
            label={pt("rec.profession")}
            value={joinTitles(presentation.titles, lang, pt("common.notStated"))}
          />
          {presentation.eligibility.length > 0 ? (
            <Row
              label={pt("identity.eligibility")}
              value={joinTitles(presentation.eligibility, lang, pt("common.notStated"))}
            />
          ) : null}
          <Row
            label={pt("rec.jurisdiction")}
            value={formatWorkLocation(
              presentation.jurisdiction,
              presentation.subJurisdiction,
              lang,
            )}
          />
          {presentation.purpose ? (
            <Row label={pt("rec.purpose")} value={presentation.purpose} />
          ) : null}
          <Row label={pt("rec.lastUpdated")} value={presentation.lastUpdated.slice(0, 10)} />
          {/* The link's validity is NOT repeated here. It is stated once, in
              the header, where a reader decides whether to act on the page at
              all — and saying it twice on one screen is how a page starts to
              read as a form rather than a record. */}
          {checkedAt ? <Row label={pt("rec.checkedAt")} value={checkedAt} /> : null}
        </dl>

        {/* WHAT A PACKAGE SHOWS, and — for a chosen scope — that the holder
            chose it. A selected share has no fixed includes list: the list IS
            the merits below it, and printing a package's promises over a
            hand-picked scope would describe a contract this share does not
            have. */}
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {pt("rec.packageShows")}
          </p>
          {presentation.packageCode === "selected_merits" ? (
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {pt("rec.selectedScope")}
            </p>
          ) : meta ? (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {meta.includesKeys.map((k) => (
                <li key={k} className="text-sm text-foreground">
                  · {pt(k)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <RecipientCredentialList credentials={presentation.credentials} />

      {presentation.experience.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.experience")}
          </h2>
          <ul className="mt-3 space-y-3">
            {presentation.experience.map((e) => {
              // The shared engine, in employment's own register. Null whenever
              // the payload carried no decider — which is every package share,
              // because no package emits employment provenance — so nothing is
              // printed rather than a level this share did not establish.
              const line = employmentTrustLine(
                describeTrust({
                  assertionLevel: "verified",
                  verifierName: e.verifiedBy ?? null,
                  verificationMethod: e.verificationMethod ?? null,
                  subjectKind: "employment",
                }),
                lang,
              );
              return (
                <li
                  key={e.id}
                  data-recipient-employment={e.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {e.role} · {e.employer}
                  </h3>
                  <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                    {formatPeriodRange(e.startedOn, e.endedOn, lang)}
                  </p>
                  {line ? (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{line}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {presentation.verifiedExperienceDays > 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.tenure")}
          </h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatDuration(presentation.verifiedExperienceDays, lang)}
          </p>
          {presentation.packageCode === "selected_merits" ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("rec.tenureScoped")}
            </p>
          ) : null}
        </section>
      ) : null}

      {presentation.isEmpty ? (
        <section className="mt-6 rounded-xl border border-dashed border-border bg-secondary/40 p-5">
          <p className="text-sm text-muted-foreground">{pt("rec.nothing")}</p>
        </section>
      ) : null}

      <section className="mt-6 space-y-2 rounded-xl border border-border p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {pt("rec.jurisdictionNote")}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">{pt("rec.notAssessment")}</p>
      </section>

      {/* Restrained, and last. The recipient came here to check somebody
          else's record, not to be sold to — and on the holder's own preview
          it is addressed to nobody at all, so it is omitted there. */}
      {preview ? null : (
        <section className="mt-6 rounded-xl border border-border bg-secondary/40 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {pt("rec.ctaTitle")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt("rec.ctaBody")}</p>
          <a
            href="/#passport"
            className="mt-3 inline-flex h-11 items-center gap-2 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("rec.ctaAction")}
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </section>
      )}
    </div>
  );
}
