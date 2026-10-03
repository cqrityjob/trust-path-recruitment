// What the canonical route says when the analysis is closed to THIS reader.
//
// ── ONE PANEL, THREE TRUE SENTENCES ────────────────────────────────────
//
// The route used to say one thing for every refusal — "not open for new
// participants" — which is true of none of them in particular:
//
//   paused       the release control closed it for everyone, anonymous
//                visitors included. Nobody can start, finish or save.
//   account      the release control is `internal_test` and this signed-in
//                account is not in the test group. The anonymous entrance is
//                open; this account's own start is not.
//   unavailable  the instrument itself is not administrable.
//
// Each has its own title and body, and none is a dead end: the panel always
// names what the reader CAN do — the career centre, jobs, the Security
// Passport — and never offers a retry that cannot succeed, because a retry
// button on a refusal is how a person ends up pressing it for ever.
//
// ── AND NOTHING THE PERSON FINISHED IS LOST WITHOUT BEING TOLD ─────────
//
// `keep` says where a finished run is still held, because the sentence that
// matters most to somebody who answered 28 questions is whether those answers
// are gone:
//
//   claim  the result was staged for saving (localStorage, seven days). It is
//          saved when the analysis opens and the same link is opened again.
//   tab    the answers are in this tab (sessionStorage) and nowhere else.
//   null   there is nothing to keep.
//
// Presentation only: it decides nothing and reads nothing. The route resolves
// the reason through resolveAnalysisAccess and the keep state from the buffer.

import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AssessmentPanel } from "@/components/career-discovery/v31/shell/AssessmentShell";
import { useT } from "@/i18n/context";
import type { AnalysisClosedReason } from "@/lib/career-discovery/analysis-access";
import { jobsEnabled } from "@/lib/job-intelligence/feature-flag";

export type ClosedKeep =
  | { readonly kind: "claim"; readonly expiresAt: string }
  | { readonly kind: "tab" }
  | null;

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function formatKeptUntil(iso: string, lang: "sv" | "en"): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", { dateStyle: "long" }).format(
    when,
  );
}

export function ClosedAnalysisPanel({
  reason,
  signedIn,
  keep = null,
}: {
  readonly reason: AnalysisClosedReason;
  readonly signedIn: boolean;
  readonly keep?: ClosedKeep;
}) {
  const { t, lang } = useT();
  const locale = lang === "en" ? "en" : "sv";
  const title =
    reason === "paused"
      ? t("cd.public.paused.title")
      : reason === "account"
        ? t("cd.public.account.title")
        : t("cd.public.unavailableTitle");
  const body =
    reason === "paused"
      ? t("cd.public.paused.body")
      : reason === "account"
        ? t("cd.public.account.body")
        : t("cd.public.unavailableBody");

  return (
    <AssessmentPanel role="status" data-testid="cd-closed" data-closed-reason={reason}>
      <h1
        className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {title}
      </h1>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
      {keep?.kind === "claim" && (
        <p
          className="mt-3 max-w-[56ch] text-sm leading-relaxed text-foreground"
          data-testid="cd-closed-keep"
          data-keep="claim"
        >
          {t("cd.public.keep.claim").replace("{date}", formatKeptUntil(keep.expiresAt, locale))}
        </p>
      )}
      {keep?.kind === "tab" && (
        <p
          className="mt-3 max-w-[56ch] text-sm leading-relaxed text-foreground"
          data-testid="cd-closed-keep"
          data-keep="tab"
        >
          {t("cd.public.keep.tab")}
        </p>
      )}
      {/* What the reader CAN do. Always present, never a retry. */}
      <ul className="mt-5 flex flex-col gap-1" data-testid="cd-closed-next">
        <li>
          <Link to="/career-center" className={LINK}>
            {t("cd.public.exploreInstead")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </li>
        {jobsEnabled() && (
          <li>
            <Link to="/jobs" className={LINK}>
              {t("cd.public.next.jobs")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </li>
        )}
        <li>
          {signedIn ? (
            <Link to="/passport" className={LINK}>
              {t("cd.public.next.passport")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <Link to="/security-passport" className={LINK}>
              {t("cd.public.next.passport")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </li>
        {signedIn && (
          <li>
            <Link to="/my-career" className={LINK}>
              {t("cd.public.claim.toMyCareer")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </li>
        )}
      </ul>
    </AssessmentPanel>
  );
}
