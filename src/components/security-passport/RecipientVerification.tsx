// The recipient verification page.
//
// ── EXPIRED, REVOKED AND NONEXISTENT ARE THE SAME PAGE ─────────────────
//
// Byte-identical output for all three. If an expired link said "expired"
// and an unknown link said "not found", the difference would confirm that a
// disclosure once existed for that token — which is an enumeration oracle,
// and enumeration resistance is a binding requirement (Product
// Architecture v1.1 §13, §25 T1).
//
// This costs a little recipient clarity, deliberately. A recipient who
// needs a working link contacts the person who sent it, which is the
// correct recovery path anyway and does not require the system to leak
// anything.
//
// ── WHAT WE HAVE AND HAVE NOT CHECKED, BOTH STATED ─────────────────────
//
// The page says what VERIFIED means AND that CQrityjob has not verified the
// holder's legal identity at this stage. A verification page that omits its
// own limits is misleading by omission, and this one is read by people
// making employment decisions.

import { eligibilityTitles, professionLine } from "@/lib/security-passport/identity/presentation";
import { EligibilityLine } from "./EligibilityLine";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatDuration, formatJurisdiction } from "@/lib/security-passport/format";
import { mayShowBadge } from "@/lib/security-passport/recognition";
import type { DisclosurePayload } from "@/lib/security-passport/disclosure";
import type { PassportCardModel } from "@/lib/security-passport/card";
import { DirectionC } from "./card/DirectionC";
import { ClaimRow } from "./ClaimRow";
import { ExperienceTimeline } from "./ExperienceTimeline";
import { JurisdictionNotice } from "./JurisdictionNotice";
import { RecognitionBadge } from "./RecognitionBadges";

/** The disclosed content itself. Shared by the holder's review step and the
 *  recipient's page, so the promise "this is exactly what they see" cannot
 *  drift apart from what they actually see. */
export function DisclosurePayloadView({
  payload,
  viewingJurisdiction,
  className,
}: {
  payload: DisclosurePayload;
  viewingJurisdiction: string;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  // A recipient sees only what the holder's VERIFIED credentials support.
  // `buildDisclosurePayload` already stripped self-declared titles; this
  // renders the same derivation the holder saw, in the reader's language.
  const profession = professionLine(payload.identity, lang, pt("identity.none"));
  const jurisdiction = formatJurisdiction(payload.jurisdictionCode, lang);

  return (
    <div className={cn("space-y-4", className)}>
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {pt("recipient.sharedBy")}
        </p>
        <h3
          className="mt-1 text-xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {payload.holderDisplayName}
        </h3>
        <p className="mt-1 text-sm text-foreground">
          {profession} · {jurisdiction}
        </p>
        {/* The one fact an employer is actually trying to establish, stated
            separately from the training line above it. Derived from the
            disclosed claims, so a package that withheld the approval shows
            nothing here. */}
        <EligibilityLine titles={eligibilityTitles(payload.identity)} className="mt-3" />

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("disclosure.package")}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">{pt(payload.packageNameKey)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("disclosure.purpose")}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">{pt(payload.purposeKey)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("recipient.expiresOn")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">{payload.expiresOn}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("recipient.contents")}
        </h4>

        {payload.sections.map((section, i) => {
          switch (section.kind) {
            case "identity":
              return null; // Already rendered in the header above.

            case "totals":
              return (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">{pt(section.labelKey)}</p>
                  <dl className="mt-3 space-y-2">
                    {(
                      [
                        ["totals.reported", section.totals.reported.elapsedDays],
                        ["totals.documented", section.totals.documented.elapsedDays],
                        ["totals.verified", section.totals.verified.elapsedDays],
                      ] as const
                    ).map(([key, days]) => (
                      <div key={key} className="flex items-baseline justify-between gap-4">
                        <dt className="text-sm text-muted-foreground">{pt(key)}</dt>
                        <dd className="text-sm tabular-nums text-foreground">
                          {days > 0 ? formatDuration(days, lang) : pt("totals.none")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );

            case "recognition":
              return (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">{pt(section.labelKey)}</p>
                  <div className="mt-3">
                    {mayShowBadge(section.recognition) ? (
                      <RecognitionBadge years={section.recognition.earnedYears as number} />
                    ) : (
                      <p className="text-sm text-muted-foreground">{pt("recognition.noneTitle")}</p>
                    )}
                  </div>
                </div>
              );

            case "periods":
              return (
                <div key={i}>
                  <p className="mb-2 text-sm font-medium text-foreground">{pt(section.labelKey)}</p>
                  <ExperienceTimeline periods={section.periods} evaluationOn={payload.expiresOn} />
                </div>
              );

            case "claims":
              return (
                <div key={i}>
                  <p className="mb-2 text-sm font-medium text-foreground">{pt(section.labelKey)}</p>
                  {section.claims.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{pt("overview.noClaims")}</p>
                  ) : (
                    <ul className="space-y-3">
                      {section.claims.map((c) => (
                        <ClaimRow key={c.id} claim={c} />
                      ))}
                    </ul>
                  )}
                </div>
              );

            case "contact":
              return (
                <div key={i} className="rounded-lg border border-dashed border-border p-4">
                  <p className="text-sm text-muted-foreground">{pt(section.labelKey)}</p>
                </div>
              );
          }
        })}
      </section>

      <JurisdictionNotice
        credentialJurisdiction={payload.jurisdictionCode}
        viewingJurisdiction={viewingJurisdiction}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          <div className="flex items-start gap-2.5">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {pt("recipient.verifiedByTitle")}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pt("recipient.verifiedByBody")}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          <div className="flex items-start gap-2.5">
            <ShieldQuestion
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {pt("recipient.notVerifiedTitle")}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pt("recipient.notVerifiedBody")}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** The neutral page. Identical for expired, revoked and unknown tokens. */
export function DisclosureUnavailable({ className }: { className?: string }) {
  const { pt } = usePassportCopy();
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-lg rounded-xl border border-border bg-card p-8 text-center",
        className,
      )}
    >
      <ShieldQuestion aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground/60" />
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
        {pt("recipient.unavailableTitle")}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {pt("recipient.unavailableBody")}
      </p>
    </section>
  );
}

export function RecipientVerification({
  payload,
  viewingJurisdiction,
  className,
  card,
  verifyUrl,
}: {
  /** Null models an unknown token — indistinguishable from expired/revoked. */
  payload: DisclosurePayload | null;
  viewingJurisdiction: string;
  className?: string;
  /** Optional hero card. When present the recipient sees the artifact they
   *  arrived from, then the authoritative detail beneath it — which is the
   *  journey the brief describes: social image → current verification page
   *  → understanding the credential. */
  card?: PassportCardModel;
  verifyUrl?: string;
}) {
  const { pt } = usePassportCopy();

  // One branch, three causes. The recipient cannot tell which.
  if (payload === null || payload.status !== "active") {
    return <DisclosureUnavailable className={className} />;
  }

  return (
    <div className={cn("mx-auto w-full max-w-5xl", className)}>
      <header className="mb-5">
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("recipient.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {pt("recipient.shareStatus")}: {pt("disclosure.status.active")}
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {card && verifyUrl ? (
          <div className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[360px]">
            <DirectionC card={card} verifyUrl={verifyUrl} className="min-h-[540px]" />
            {/* The card is the artifact; the page is the authority. Saying
                so here is what stops a cached image from being treated as
                proof of current status. */}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {pt("card.snapshotNote")}
            </p>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <DisclosurePayloadView payload={payload} viewingJurisdiction={viewingJurisdiction} />
        </div>
      </div>
    </div>
  );
}
