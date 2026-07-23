// Employer OS Phase 1 — shared "controlled future state" module shell.
//
// Used by every top-level Employer OS module that has no working backend
// yet (Competencies & Certificates, Training, Sites & Risk, Reports &
// Compliance, Analytics, preferences-style Settings). Deliberately not a
// generic "coming soon" stub: each usage supplies real, specific product
// intent (purpose, value, next milestone) so the page reads as an
// intentional part of the roadmap rather than an unfinished placeholder.
// Never renders a fabricated metric, record, or an active control that
// would route somewhere broken.

import { useT } from "@/i18n/context";
import type { ReactNode } from "react";

export function EmployerModuleComingSoon({
  icon,
  title,
  purpose,
  value,
  milestone,
}: {
  icon: ReactNode;
  title: string;
  purpose: string;
  value: string;
  milestone: string;
}) {
  const { t } = useT();
  return (
    <div>
      <div className="flex items-start gap-4">
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("employer.module.comingSoon.badge")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("employer.module.comingSoon.purpose")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{purpose}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("employer.module.comingSoon.value")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{value}</p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("employer.module.comingSoon.milestone")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{milestone}</p>
        </div>
      </div>
    </div>
  );
}
