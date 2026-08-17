// The Security Passport entry in the authenticated candidate home.
//
// The minimum appropriate entry, per the approved shared-home architecture:
// Career Card and Security Passport sit side by side as two separate
// products under one account. This component is the Passport half.
//
// ── DELIBERATELY STATELESS ─────────────────────────────────────────────
//
// It fetches nothing. /my-career already makes a queue of requests on
// mount, and adding another just to decide between "Start" and "Continue"
// would slow the shared home to personalise a button. The destination
// resolves the holder's real state on arrival, where it has to anyway.
//
// It also means this card cannot leak Passport content into a page that is
// not the Passport.

import { Link } from "@tanstack/react-router";
import { IdCard, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export function MyPassportEntryCard({ className }: { className?: string }) {
  const { pt } = usePassportCopy();

  return (
    <section
      className={cn("rounded-xl border-2 border-primary/20 bg-card p-5", className)}
      aria-labelledby="sp-entry-heading"
    >
      <div className="flex items-start gap-3">
        <IdCard aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h3
            id="sp-entry-heading"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            {pt("home.passport.title")}
          </h3>
          <p className="mt-1 text-sm text-foreground">{pt("home.passport.tagline")}</p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {pt("home.passport.body")}
      </p>

      <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
        <Lock aria-hidden="true" className="h-3 w-3" />
        {pt("overview.privateNote")}
      </p>

      <Link
        to="/passport"
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {pt("home.passport.start")}
      </Link>
    </section>
  );
}
