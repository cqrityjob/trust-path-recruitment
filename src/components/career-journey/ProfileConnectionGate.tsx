// The one screen between "I want to do this" and the first question, for a
// signed-in candidate.
//
// ── WHY IT EXISTS ──────────────────────────────────────────────────────
//
// Two opposite failures were both live.
//
// A signed-in candidate who had already filled in their career profile was
// asked the same questions again inside the assessment, and afterwards read
// a report that said the product did not know their current situation. The
// product held the answer and did not use it.
//
// A signed-in candidate who had NOT filled it in was never told that doing
// so would change anything, so the report they got was the impersonal one
// and they had no idea a better one was available for two minutes' work.
//
// This screen closes both, in the only way that does not cost anything:
// by SAYING what is known and offering the choice.
//
// ── WHAT IT MUST NEVER BECOME ──────────────────────────────────────────
//
// A wall. Career Discovery is takeable without an account and, for somebody
// signed in, without a profile — that is a product commitment, not an
// oversight. So the primary action on both variants starts the assessment,
// the profile route is always the secondary one, and there is no state of
// this component in which the candidate cannot proceed. Anonymous visitors
// never see it at all: there is no profile to connect and no account to
// connect it to, and interrupting them with an account-shaped screen before
// their first question is exactly the wall this is not.

import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import { pickText } from "@/lib/assessment-content";
import {
  currentStatusOptions,
  yearsOfExperienceOptions,
} from "@/lib/security-career-profile/options";
import type { SecurityCareerProfileDraft } from "@/lib/security-career-profile/types";

/** Enough of a profile to be worth connecting.
 *
 *  A status alone qualifies. Requiring all three would leave somebody who
 *  answered two of them being told their profile is missing, which is both
 *  untrue and the fastest way to make a person stop filling things in. */
function isProfileConnected(profile: SecurityCareerProfileDraft | null): boolean {
  if (!profile) return false;
  return (
    profile.currentStatus !== null ||
    profile.currentProfessionSlug !== null ||
    (profile.currentProfessionOther?.trim() ?? "") !== "" ||
    profile.yearsOfExperience !== null
  );
}

export function ProfileConnectionGate({
  profile,
  professionTitle,
  onStart,
  onOpenProfile,
  locale,
}: {
  readonly profile: SecurityCareerProfileDraft | null;
  /** Resolved catalogue title for `profile.currentProfessionSlug`, when the
   *  caller has it. Falls back to the free-text profession, then to nothing
   *  — never to a raw slug. */
  readonly professionTitle: string | null;
  readonly onStart: () => void;
  readonly onOpenProfile: () => void;
  readonly locale: "sv" | "en";
}) {
  const { t } = useT();
  const connected = isProfileConnected(profile);

  const statusLabel =
    profile?.currentStatus != null
      ? pickText(currentStatusOptions.find((o) => o.id === profile.currentStatus)!.label, locale)
      : null;
  const yearsLabel =
    profile?.yearsOfExperience != null
      ? pickText(
          yearsOfExperienceOptions.find((o) => o.id === profile.yearsOfExperience)!.label,
          locale,
        )
      : null;
  const roleLabel = professionTitle ?? profile?.currentProfessionOther ?? null;

  const rows: { label: string; value: string }[] = [
    ...(statusLabel ? [{ label: t("cj.field.status"), value: statusLabel }] : []),
    ...(roleLabel ? [{ label: t("cj.field.profession"), value: roleLabel }] : []),
    ...(yearsLabel ? [{ label: t("cj.field.experience"), value: yearsLabel }] : []),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-7 sm:p-9">
      <h1
        className="text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t(connected ? "cj.gate.connected.title" : "cj.gate.missing.title")}
      </h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        {t(connected ? "cj.gate.connected.body" : "cj.gate.missing.body")}
      </p>

      {connected && rows.length > 0 ? (
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {r.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* The assessment is the PRIMARY action in both states. A candidate who
          does not want to talk about themselves first is one click from the
          first question, which is the entire reason this screen is allowed to
          exist at all. */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onStart}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
        >
          {t(connected ? "cj.gate.connected.start" : "cj.gate.missing.start")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          className="inline-flex h-12 items-center justify-center rounded-[10px] border border-input px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          {t(connected ? "cj.gate.connected.review" : "cj.gate.missing.addProfile")}
        </button>
      </div>
    </div>
  );
}
