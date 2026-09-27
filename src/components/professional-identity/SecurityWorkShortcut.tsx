// "Fortsätt i Mitt säkerhetsarbete" — the overview's way into the separate
// security workspace (MVP text specification §7).
//
// ── A SHORTCUT AND NOTHING ELSE ────────────────────────────────────────
//
// It reads nothing. No count, no status and no title from the workspace
// appears on the career overview: the workspace holds security analyses,
// reports and actions, and the overview is the person's career page. What
// is in there is for /security-work to show, behind its own access checks —
// exactly as when the URL is typed. The link is presentation only.

import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { L, type Lang } from "./copy";
import { WORK_SHORTCUT } from "./home-copy";
import { LINK } from "./home-format";

export function SecurityWorkShortcut({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <div
      data-overview-security-work
      className={cn("rounded-lg border border-border bg-card p-4 shadow-xs", className)}
    >
      <Link to="/security-work" className={LINK}>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        {L(WORK_SHORTCUT.title, lang)}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {L(WORK_SHORTCUT.body, lang)}
      </p>
    </div>
  );
}
