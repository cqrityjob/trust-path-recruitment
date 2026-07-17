import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { useT } from "@/i18n/context";

/**
 * Card inviting unauthenticated visitors and signed-in users without a
 * saved Career Profile to complete the Security Career Assessment. Job
 * browsing itself is never blocked — this card is purely optional
 * guidance.
 */
export function AssessmentInvite({ variant = "banner" }: { variant?: "banner" | "sidebar" }) {
  const { t } = useT();
  const body = t("jobs.relevance.invite.body");
  const cta = t("jobs.relevance.invite.cta");
  const title = t("jobs.relevance.invite.title");

  return (
    <aside
      aria-label={title}
      className={
        variant === "sidebar"
          ? "rounded-lg border border-primary/30 bg-primary/5 p-4"
          : "mt-6 rounded-lg border border-primary/30 bg-primary/5 p-5 sm:p-6"
      }
    >
      <div className="flex items-start gap-3">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
          <Link
            to="/security-career-assessment"
            className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {cta}
          </Link>
        </div>
      </div>
    </aside>
  );
}