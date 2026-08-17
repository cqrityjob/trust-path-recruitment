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

import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getPublicDisclosure } from "@/lib/security-passport/public-disclosure.functions";
import { LIVE_PACKAGES, type RecipientPayload } from "@/lib/security-passport/packages";
import { formatDuration, formatExpiry, formatPeriodRange } from "@/lib/security-passport/format";
import { validityOf } from "@/lib/security-passport/validity";
import { LifecycleChip } from "@/components/security-passport/LifecycleChip";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { LifecycleState } from "@/lib/security-passport/types";

export const Route = createFileRoute("/p/$token")({
  ssr: false,
  head: () => ({
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
      { name: "twitter:card", content: "summary" },
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
  const { token } = useParams({ from: "/p/$token" });
  const read = useServerFn(getPublicDisclosure);

  const [payload, setPayload] = useState<RecipientPayload | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>("");

  useEffect(() => {
    let alive = true;
    void read({ data: { token } })
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
  }, [read, token]);

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
  const tenureDays = payload.verified_experience_days ?? 0;
  const showsTenure =
    payload.package === "public_card" ||
    payload.package === "verified_experience" ||
    payload.package === "employer_review" ||
    payload.package === "full_verification";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
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

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label={pt("rec.holder")} value={payload.holder ?? pt("rec.anonymousHolder")} />
          <Row label={pt("rec.package")} value={meta ? pt(meta.nameKey) : payload.package} />
          <Row
            label={pt("rec.profession")}
            value={payload.profession_slug ? "Väktare" : pt("common.notStated")}
          />
          <Row
            label={pt("rec.jurisdiction")}
            value={payload.jurisdiction === "SE" ? pt("jurisdiction.SE") : payload.jurisdiction}
          />
          {payload.purpose ? <Row label={pt("rec.purpose")} value={payload.purpose} /> : null}
          <Row label={pt("rec.lastUpdated")} value={payload.last_updated.slice(0, 10)} />
          {payload.expires_at ? (
            <Row label={pt("rec.linkExpires")} value={payload.expires_at.slice(0, 10)} />
          ) : null}
          <Row label={pt("rec.checkedAt")} value={checkedAt} />
        </dl>
      </section>

      {/* ── Verified qualifications ─────────────────────────────────── */}
      {payload.verified_claims.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.qualifications")}
          </h2>
          <ul className="mt-3 space-y-3">
            {payload.verified_claims.map((c) => {
              // Expiry is derived here, exactly as it is for the holder. A
              // verified credential whose validity has passed is shown
              // VERIFIED and EXPIRED — never quietly dropped, and never
              // presented as current.
              const v = validityOf(c.lifecycle as LifecycleState, c.valid_until, today());
              return (
                <li key={c.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground">
                      {c.title}
                    </h3>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                        {pt("assertion.verified")}
                      </span>
                      <LifecycleChip state={v.effectiveState} />
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                    <Row label={pt("rec.issuer")} value={c.issuer ?? pt("common.notStated")} />
                    <Row
                      label={pt("rec.verifiedBy")}
                      value={c.verifier_organisation ?? pt("common.notStated")}
                    />
                    <Row
                      label={pt("rec.method")}
                      value={
                        c.verification_method
                          ? pt(METHOD_KEY[c.verification_method] ?? "common.notStated")
                          : pt("common.notStated")
                      }
                    />
                    <Row
                      label={pt("rec.verifiedAt")}
                      value={c.verified_at ? c.verified_at.slice(0, 10) : pt("common.notStated")}
                    />
                    <Row label={pt("rec.validUntil")} value={formatExpiry(c.valid_until, lang)} />
                    {c.jurisdiction ? (
                      <Row
                        label={pt("rec.jurisdiction")}
                        value={c.jurisdiction === "SE" ? pt("jurisdiction.SE") : c.jurisdiction}
                      />
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ── Verified employment ─────────────────────────────────────── */}
      {payload.verified_experience.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.experience")}
          </h2>
          <ul className="mt-3 space-y-3">
            {payload.verified_experience.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground">
                    {e.role} · {e.employer}
                  </h3>
                  <LifecycleChip state={e.lifecycle as LifecycleState} />
                </div>
                <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                  {formatPeriodRange(e.started_on, e.ended_on, lang)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Verified tenure, as an aggregate ────────────────────────── */}
      {showsTenure && tenureDays > 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pt("rec.tenure")}
          </h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatDuration(tenureDays, lang)}
          </p>
        </section>
      ) : null}

      {payload.verified_claims.length === 0 && payload.verified_experience.length === 0 ? (
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
