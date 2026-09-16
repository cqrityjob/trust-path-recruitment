import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { CompactPassportCard } from "./CompactPassportCard";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function PassportSideColumn({
  snapshot,
  today,
  metadata,
  className = "",
}: {
  snapshot: PassportSnapshot;
  /** Injected so the guard can render a fixed day rather than "now". */
  today: string;
  metadata?: InternationalPassportMetadata;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const profile = snapshot.profile;
  if (!profile) return null;

  return (
    <aside
      data-passport-side-column
      aria-labelledby="sp-side-card-heading"
      className={`w-full space-y-4 lg:w-[340px] lg:shrink-0 ${className}`}
    >
      <section>
        <h2
          id="sp-side-card-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          {pt("side.cardTitle")}
        </h2>
        {/* The owner summary never creates or displays a share token. */}
        <div className="mt-2">
          <CompactPassportCard snapshot={snapshot} today={today} metadata={metadata} />
        </div>
        <Link to="/passport/card" data-cta="open-card" className={`${LINK} mt-2`}>
          {pt("side.openCard")}
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </section>

      {/* ── Integrity, privacy and sharing ───────────────────────────── */}
      <section
        aria-labelledby="sp-side-privacy-heading"
        className="rounded-xl border border-border bg-card p-4"
        data-passport-privacy-summary
      >
        <h2
          id="sp-side-privacy-heading"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
        >
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          {pt("privacy.title")}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {pt("privacy.defaultBody")}
        </p>

        {/* The one fact that decides what the card above says about who the
            holder is. Reported here, changed on the page that owns it. */}
        <dl className="mt-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {pt("share.privacyMode")}
          </dt>
          <dd data-privacy-mode={profile.privacyMode} className="mt-0.5 text-sm text-foreground">
            {pt(`share.privacy.${profile.privacyMode}` as PassportCopyKey)}
          </dd>
        </dl>

        <div className="mt-3 flex flex-col gap-1">
          <Link to="/passport/privacy" data-cta="open-privacy" className={LINK}>
            {pt("side.openPrivacy")}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </aside>
  );
}
