import { Link } from "@tanstack/react-router";
import { ArrowRight, Radio, Target } from "lucide-react";
import { useT } from "@/i18n/context";
import { useSecurityWorkspace } from "./context";
import { EmptyState, PageHeading, WorkButton, panelClass } from "./ui";

export function SecurityOverview() {
  const { t } = useT();
  const { workspace, profile, requirements, counts, sources, canEdit } = useSecurityWorkspace();
  const active = requirements.filter((requirement) => requirement.status === "active");
  return (
    <>
      <PageHeading title={t("sw.overview.title")} body={t("sw.overview.body")} />
      <section className={`${panelClass} border-l-4 border-l-accent`}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
          <Radio className="size-4" aria-hidden="true" />
          {t("sw.manual")}
        </p>
        <h2 className="mt-3 font-display text-xl font-semibold">
          {counts.pending > 0 ? t("sw.overview.pending") : t("sw.overview.noPending")}
        </h2>
        {counts.pending > 0 && (
          <p className="mt-3 text-4xl font-semibold tabular-nums" data-testid="sw-pending-count">
            {counts.pending}
          </p>
        )}
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {counts.pending > 0 ? t("sw.overview.pendingBody") : t("sw.overview.noPendingBody")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <WorkButton asChild>
            <Link
              to="/security-work/$workspaceId/monitoring"
              params={{ workspaceId: workspace.id }}
            >
              {t("sw.overview.openInbox")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </WorkButton>
          {canEdit && (
            <WorkButton asChild variant="outline">
              <Link to="/security-work/$workspaceId/sources" params={{ workspaceId: workspace.id }}>
                {t("sw.sources.title")}
              </Link>
            </WorkButton>
          )}
        </div>
      </section>
      {!profile ? (
        <EmptyState title={t("sw.overview.start")} body={t("sw.overview.startBody")}>
          <WorkButton asChild variant="outline">
            <Link to="/security-work/$workspaceId/settings" params={{ workspaceId: workspace.id }}>
              {t("sw.overview.editProfile")}
            </Link>
          </WorkButton>
        </EmptyState>
      ) : (
        <section className={panelClass}>
          <h2 className="font-display text-lg font-semibold">{t("sw.overview.profile")}</h2>
          {profile.sector && <p className="mt-3 break-words font-medium">{profile.sector}</p>}
          {profile.decisions_supported && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {profile.decisions_supported}
            </p>
          )}
          {!profile.onboarding_completed && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("sw.overview.profileIncomplete")}
            </p>
          )}
          <WorkButton asChild variant="outline" className="mt-5">
            <Link to="/security-work/$workspaceId/settings" params={{ workspaceId: workspace.id }}>
              {t("sw.overview.editProfile")}
            </Link>
          </WorkButton>
        </section>
      )}
      <section className={panelClass}>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Target className="size-5 text-accent" aria-hidden="true" />
          {t("sw.overview.requirements")}
        </h2>
        {active.length ? (
          <ul className="mt-4 space-y-3">
            {active.slice(0, 4).map((requirement) => (
              <li
                key={requirement.id}
                className="border-l-2 border-accent/30 pl-4 break-words text-sm leading-relaxed"
              >
                {requirement.question}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("sw.overview.noRequirements")}
          </p>
        )}
        <WorkButton asChild variant="outline" className="mt-5">
          <Link to="/security-work/$workspaceId/monitoring" params={{ workspaceId: workspace.id }}>
            {active.length ? t("sw.nav.monitoring") : t("sw.overview.addRequirement")}
          </Link>
        </WorkButton>
        <p className="mt-5 text-xs text-muted-foreground">
          {t("sw.overview.sources")}: {sources.length}
        </p>
      </section>
    </>
  );
}
