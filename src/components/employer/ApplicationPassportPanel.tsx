// The Security Passport section of Candidate overview — what the candidate
// chose to disclose, or the sentence that says they did not.
//
// ── IT REPLACES A SENTENCE, IT DOES NOT REPLACE THE SECTION ─────────────
//
// PR #58 gave Candidate overview a Security Passport section that reads
// NOTHING and renders one pinned sentence for every candidate on the
// platform, because a section that appeared only for holders would disclose
// precisely the fact an employer is not entitled to.
//
// That property is preserved exactly. The section still renders for every
// candidate; its heading and its lede are untouched; and when nothing has
// been disclosed this component renders `employer.candidate.passport.none`,
// the same pinned sentence, in the same shell. What changed is only that the
// holder now HAS a way to make it say something else.
//
// So a loading state, an error, an outage and "nothing shared" all render
// that same sentence. There is no spinner and no empty state to time: any
// difference between them would be observable, and an observable difference
// on this page is an oracle for whether a Passport exists.
//
// ── WHAT MAKES THIS ALLOWED WHERE PR #58 ALLOWED NOTHING ────────────────
//
// PR #58's guard banned every route by which Passport data could reach an
// employer surface, and named the condition under which the ban is revisited:
// "if in-platform, holder-authorised, application-scoped disclosure is
// designed later, it replaces that copy and arrives as its own reviewed
// integration". This is that integration, and the guard was revisited
// deliberately rather than loosened quietly — see rule 3b/3d in
// scripts/passport-separation-check.ts, which now permits this one component
// and this one server function on this one route, and still bans everything
// else on every recruitment surface including the applications list.
//
// The consent is real and is the holder's: sp_application_disclosure returns
// a payload only when that candidate created a disclosure naming THIS
// application, and returns the same "nothing" for a non-member, an unknown
// application, a revoked share and an expired one.
//
// ── ONE CONTRACT, NOT A SECOND READING OF IT ────────────────────────────
//
// The payload is the one /p/$token receives, interpreted by the same
// buildRecipientPresentation and drawn by the same RecipientPassportCard. A
// separate employer rendering would be a second interpretation of the package
// contract, and the two would eventually disagree about whether a licence is
// current — which in a trust product is the worst available bug.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { LIVE_PACKAGES } from "@/lib/security-passport/packages";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { readApplicationDisclosure } from "@/lib/security-passport/application-disclosure.functions";
import { RecipientPassportCard } from "@/components/security-passport/live/RecipientPassportCard";

/** The reading date. Expiry is derived and never stored, so every surface
 *  must say WHEN it is reading — see recipient-presentation.ts. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ApplicationPassportPanel({ applicationId }: { applicationId: string }) {
  const { t } = useT();
  const { pt } = usePassportCopy();
  const readFn = useServerFn(readApplicationDisclosure);

  const query = useQuery({
    queryKey: ["employer", "application", applicationId, "shared-records"],
    queryFn: () => readFn({ data: { applicationId } }),
  });

  const payload = query.data;
  const presentation = useMemo(
    () =>
      payload && payload.status === "active" ? buildRecipientPresentation(payload, today()) : null,
    [payload],
  );

  // Loading, error, nothing shared, revoked and expired are ONE branch on
  // purpose, and it is the sentence PR #58 pinned.
  if (!presentation) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        {t("employer.candidate.passport.none")}
      </p>
    );
  }

  const meta = LIVE_PACKAGES.find((p) => p.code === presentation.packageCode);
  // This page is the live source: a card read here is current, and a
  // screenshot of it is not.
  const verifyUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="mt-4">
      <p className="text-sm text-muted-foreground">{t("employer.candidate.passport.shared")}</p>

      <div className="mt-4 max-w-sm">
        <RecipientPassportCard presentation={presentation} verifyUrl={verifyUrl} />
      </div>

      {meta ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {pt("rec.packageShows")}
          </p>
          <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
            {meta.includesKeys.map((k) => (
              <li key={k} className="text-sm text-foreground">
                · {pt(k)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 max-w-[68ch] text-sm text-muted-foreground">
        {t("employer.candidate.passport.sharedNote")}
      </p>

      {presentation.expiresAt ? (
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          {pt("rec.linkExpires")}: {presentation.expiresAt.slice(0, 10)}
        </p>
      ) : null}
    </div>
  );
}
