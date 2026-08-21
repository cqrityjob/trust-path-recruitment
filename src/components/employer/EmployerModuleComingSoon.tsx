// The quiet page behind an area that is not part of the workspace yet.
//
// These five areas -- Kompetens, Platser, Rapporter, Analys and the older
// preferences page -- were removed from the customer navigation because they
// have no working backend. The routes stay mounted so an existing bookmark
// resolves to an explanation rather than a 404, and this is that explanation:
// the area's name, one sentence about what it is for, and the way back.
//
// It deliberately no longer renders the old three-card roadmap (purpose /
// employer value / next milestone). A customer opening a page by accident
// wants to know where they are, not to read our delivery plan.

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import type { ReactNode } from "react";

export function EmployerModuleComingSoon({
  icon,
  title,
  purpose,
  employerSlug,
}: {
  icon: ReactNode;
  title: string;
  purpose: string;
  employerSlug: string;
}) {
  const { t } = useT();
  return (
    <div className="max-w-xl">
      <div className="flex items-start gap-4">
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("employer.module.notYet.body")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{purpose}</p>
          <Link
            to="/employer/$employerSlug"
            params={{ employerSlug }}
            className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/60 hover:bg-muted/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("employer.module.notYet.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
