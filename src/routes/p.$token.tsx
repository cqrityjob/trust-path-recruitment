// Security Passport — the public recipient page.
//
// The only anonymous surface in the product, and the only page a stranger
// ever sees. Everything about it is shaped by two facts:
//
//   1. THE PAGE IS THE RECORD. An image can be cached, forwarded and kept
//      long after a credential lapses or a share is revoked. This page is
//      re-read on every open, so it is the thing that can be trusted — and
//      it says so, plainly, rather than assuming the reader knows.
//
//   2. IT MUST TELL A STRANGER NOTHING THEY DO NOT ALREADY HOLD. Revoked,
//      expired, never-existed and rate-limited all render identically, from
//      one `status: "unavailable"` payload. Any difference between them
//      would be an oracle: a way to learn that a token was once real, or
//      that a guess is getting warmer.
//
// ── noindex, AND WHY THE PREVIEW IS GENERIC ────────────────────────────
//
// A share link is addressed to one recipient. It is not published, so it is
// not indexed. The Open Graph metadata is deliberately BRANDED AND GENERIC:
// a per-holder preview image would have to live at a public, crawler-
// reachable URL, which means a personalised artifact that survives
// revocation — the exact failure this page exists to avoid. The holder gets
// their personalised image from the sharing centre, to attach deliberately.
//
// `noindex, nofollow` stays. A share link is private correspondence, and
// keeping it out of search indexes is a governance decision, not a tuning
// knob to trade away for a nicer preview.

import { CredentialScopeLine } from "@/components/security-passport/live/CredentialScopeLine";
import { joinTitles } from "@/lib/security-passport/identity/presentation";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getPublicDisclosureFromCookie } from "@/lib/security-passport/public-disclosure.functions";
import { LIVE_PACKAGES, type RecipientPayload } from "@/lib/security-passport/packages";
import {
  formatDuration,
  formatExpiry,
  formatJurisdiction,
  formatPeriodRange,
} from "@/lib/security-passport/format";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { CredentialSymbol } from "@/components/security-passport/CredentialSymbol";
import { LifecycleChip, LifecycleNote } from "@/components/security-passport/LifecycleChip";
import { RecipientPassportCard } from "@/components/security-passport/live/RecipientPassportCard";
import { CredentialVerificationPage } from "@/components/security-passport/live/CredentialVerificationPage";
import { publicShareOrigin } from "@/lib/security-passport/public-origin";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export const Route = createFileRoute("/p/$token")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: "Security Passport — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
      // Branded and generic on purpose — see the note above. A crawler that
      // follows this link learns what CQrityjob is, and nothing about the
      // person who shared it.
      { property: "og:title", content: "Security Passport — CQrityjob" },
      {
        property: "og:description",
        content:
          "Verifierade yrkesuppgifter, delade av innehavaren. / Verified professional records, shared by the holder.",
      },
      { property: "og:type", content: "website" },
      // The canonical address of THIS page, and the one piece of the Open
      // Graph set that was missing. It is built on the configured public
      // origin rather than the request's own host, so a preview deployment
      // cannot publish its own ephemeral hostname into a shared post even
      // when the page is reached through one.
      { property: "og:url", content: `${publicShareOrigin()}/p/${params.token}` },
      // A real branded card rather than no image at all — but GENERIC, and
      // identical for every share. A crawler caches what it fetches and
      // cannot be told to forget it, so a personalised preview would be a
      // public artifact outliving the share that produced it. Because this
      // one carries nothing about the holder, possessing it reveals not even
      // that a particular share exists, and revocation costs it nothing.
      // Absolute: crawlers resolve og:image poorly or not at all when it is
      // relative. Same canonical origin the sitemap route already uses.
      { property: "og:image", content: `${publicShareOrigin()}/og-security-passport.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "CQrityjob Security Passport",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipientRoute,
});

const METHOD_KEY: Readonly<Record<string, PassportCopyKey>> = {
  document_review: "ver.method.document_review",
  employer_confirmation: "ver.method.employer_confirmation",
  issuer_confirmation: "ver.method.issuer_confirmation",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function RecipientRoute() {
  const { pt, lang } = usePassportCopy();
  // The param here is a NAVIGATION ID, never a token.
  //
  // src/server.ts answers `/p/<token>` with a 302 to `/p/<navigationId>` and
  // puts the token in an HttpOnly cookie named after that id, before any
  // document exists — because the host injects an analytics script that reports
  // window.location.href on every full page load, and the token is a bearer
  // capability. By the time this component runs, the address bar holds a
  // one-way hash that authorises nothing.
  //
  // It IS read, and must be: it names which share this tab is on. Two open
  // shares hold two differently-named cookies, and without the id the server
  // could not tell them apart — which is exactly the substitution bug the
  // single-cookie version had. See share-transport.ts.
  const { token: navigationId } = useParams({ from: "/p/$token" });
  const read = useServerFn(getPublicDisclosureFromCookie);

  const [payload, setPayload] = useState<RecipientPayload | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>("");

  // The payload is interpreted ONCE. The card below, the detail list and the
  // downloadable image all read this same model, so none of them can form a
  // different opinion about whether a credential is still current.
  const presentation = useMemo(
    () => (payload?.status === "active" ? buildRecipientPresentation(payload, today()) : null),
    [payload],
  );

  useEffect(() => {
    let alive = true;
    void read({ data: { navigationId } })
      .then((result) => {
        if (!alive) return;
        setPayload(result);
        setCheckedAt(new Date().toISOString().slice(0, 16).replace("T", " "));
      })
      .catch(() => {
        // A network or server failure must land in the SAME place as an
        // invalid token. Distinguishing them would leak the distinction.
        if (alive) setPayload({ status: "unavailable" });
      });
    return () => {
      alive = false;
    };
  }, [read, navigationId]);

  if (!payload) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{pt("rec.checking")}</p>
      </main>
    );
  }

  if (payload.status === "unavailable") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("rec.brand")}
        </p>
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <ShieldAlert aria-hidden="true" className="h-5 w-5" />
            {pt("rec.unavailableTitle")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {pt("rec.unavailableBody")}
          </p>
        </div>
      </main>
    );
  }

  const meta = LIVE_PACKAGES.find((p) => p.code === payload.package);
  // `presentation` is non-null whenever the payload is active; the guard
  // keeps TypeScript honest without a cast.
  if (!presentation) return null;
  // The canonical site address, NOT this page's own URL.
  //
  // It used to be `window.location.href`, which was the share link itself —
  // and that link is a bearer capability, printed onto a card a recipient can
  // screenshot and forward. Since the token moved out of the URL it would now
  // read `/p/view`, which is worse than useless: it grants nothing AND leads a
  // reader who tries it to "this link is not available".
  //
  // So it names where the record lives. A recipient returns through the link
  // they were sent — the page is re-read on every open, which is the property
  // the footer is claiming — and nothing printed here is a credential.
  const shareUrl = publicShareOrigin();

  // A single-credential share is a different object from a Passport, so it
  // gets its own presentation rather than the Passport page with one row.
  if (presentation.focus === "credential" && presentation.credentials.length === 1) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("rec.brand")}
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {pt("rec.authoritative")}
        </p>
        <div className="mt-6">
          <CredentialVerificationPage
            credential={presentation.credentials[0]}
            holderLabel={presentation.holderLabel ?? pt("rec.anonymousHolder")}
            jurisdiction={formatJurisdiction(presentation.jurisdiction, lang)}
            verifyUrl={shareUrl}
          />
        </div>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          {pt("rec.checkedAt")}: {checkedAt}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
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

        {/* Stated at the top, before any content: this page — not a
            screenshot of it — is the current position. */}
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {pt("rec.authoritative")}
        </p>
      </header>

      {/* ── The Passport itself, first ──────────────────────────────── */}
      <section className="mt-6" aria-label={pt("rec.cardTitle")}>
        <RecipientPassportCard presentation={presentation} verifyUrl={shareUrl} />
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
            label={pt("rec.package")}
            value={meta ? pt(meta.nameKey) : presentation.packageCode}
          />
          <Row
            label={pt("rec.profession")}
            value={joinTitles(presentation.titles, lang, pt("common.notStated"))}
          />
          {/* Separate from `rec.profession` deliberately: one says what this
              person may be CALLED, the other says what an authority currently
              PERMITS, and a public reader must not merge them. */}
          {presentation.eligibility.length > 0 ? (
            <Row
              label={pt("identity.eligibility")}
              value={joinTitles(presentation.eligibility, lang, pt("common.notStated"))}
            />
          ) : null}
          <Row
            label={pt("rec.jurisdiction")}
            value={formatJurisdiction(presentation.jurisdiction, lang)}
          />
          {presentation.purpose ? (
            <Row label={pt("rec.purpose")} value={presentation.purpose} />
          ) : null}
          <Row label={pt("rec.lastUpdated")} value={presentation.lastUpdated.slice(0, 10)} />
          {presentation.expiresAt ? (
            <Row label={pt("rec.linkExpires")} value={presentation.expiresAt.slice(0, 10)} />
          ) : null}
          <Row label={pt("rec.checkedAt")} value={checkedAt} />
        </dl>

        {/* What this package does and does not carry, so a recipient knows
            what an absence means rather than guessing. */}
        {meta ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("rec.packageShows")}
            </p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {meta.includesKeys.map((k) => (
                <li key={k} className="text-sm text-foreground">
                  · {pt(k)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── Disclosed credentials, in full ──────────────────────────── */}
      {presentation.credentials.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.qualifications")}
          </h2>
          <ul className="mt-3 space-y-3">
            {presentation.credentials.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <CredentialSymbol
                      code={c.code}
                      state={c.presentation}
                      name={c.title}
                      size={40}
                      className="mt-0.5 shrink-0"
                    />
                    <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground">
                      {c.title}
                    </h3>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    {/* An entry that is no longer current must not carry the
                        present-tense VERIFIED pill. */}
                    {c.lifecycle === "active" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                        {pt("assertion.verified")}
                      </span>
                    ) : (
                      <AssertionChip level={c.assertion} size="sm" className="opacity-80" />
                    )}
                    <LifecycleChip state={c.lifecycle} />
                  </span>
                </div>

                <LifecycleNote state={c.lifecycle} />

                {/* The same component the card uses, so the public page and
                    the employer's application view cannot drift into two
                    readings of one privacy boundary. */}
                <CredentialScopeLine credential={c} className="mt-3" />

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Row label={pt("rec.issuer")} value={c.issuer ?? pt("common.notStated")} />
                  {c.subJurisdiction ? (
                    <Row label={pt("rec.subJurisdiction")} value={c.subJurisdiction} />
                  ) : null}
                  <Row
                    label={pt("rec.verifiedBy")}
                    value={c.verifierOrganisation ?? pt("common.notStated")}
                  />
                  <Row
                    label={pt("rec.method")}
                    value={
                      c.verificationMethod
                        ? pt(METHOD_KEY[c.verificationMethod] ?? "common.notStated")
                        : pt("common.notStated")
                    }
                  />
                  <Row
                    label={pt("rec.verifiedAt")}
                    value={c.verifiedAt ? c.verifiedAt.slice(0, 10) : pt("common.notStated")}
                  />
                  <Row label={pt("rec.validUntil")} value={formatExpiry(c.validUntil, lang)} />
                  {c.jurisdiction ? (
                    <Row
                      label={pt("rec.jurisdiction")}
                      value={formatJurisdiction(c.jurisdiction, lang)}
                    />
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Verified employment ─────────────────────────────────────── */}
      {presentation.experience.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.experience")}
          </h2>
          <ul className="mt-3 space-y-3">
            {presentation.experience.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {e.role} · {e.employer}
                </h3>
                <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                  {formatPeriodRange(e.startedOn, e.endedOn, lang)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Verified tenure, as an aggregate ────────────────────────── */}
      {presentation.verifiedExperienceDays > 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.tenure")}
          </h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatDuration(presentation.verifiedExperienceDays, lang)}
          </p>
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
          else's record, not to be sold to. */}
      <section className="mt-6 rounded-xl border border-border bg-secondary/40 p-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {pt("rec.ctaTitle")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt("rec.ctaBody")}</p>
        <a
          href="/"
          className="mt-3 inline-flex h-11 items-center gap-2 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("rec.ctaAction")}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </section>
    </main>
  );
}
