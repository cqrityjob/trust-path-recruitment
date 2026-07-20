// Phase H3.2 — /employer/$employerSlug/settings: organisation profile
// view/edit. New in this phase, backed by a new additive migration
// (supabase/migrations/20260720064743_h3_2_employer_settings.sql) that
// adds the employers_owner_admin_update RLS policy and the
// employers_validate_before_write trigger guard (status/slug immutable
// for non-admins). Owner/admin can edit; a plain member sees a read-only
// view. Status is always displayed, never editable here.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import {
  EmployerWorkspaceChrome,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerWorkspaceChrome";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import {
  getEmployerOrganisation,
  updateEmployerOrganisation,
} from "@/lib/job-intelligence/employer-settings.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/settings")({
  ssr: false,
  component: EmployerSettingsPage,
  errorComponent: EmployerErrorState,
});

function EmployerSettingsPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: employerPortalEnabled(),
  });

  if (!employerPortalEnabled()) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employer.comingSoon.heading")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
        </Section>
      </SiteLayout>
    );
  }

  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  if (workspacesQuery.isLoading) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }

  if (workspacesQuery.isError || !workspace) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employer.accessDenied.heading")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.accessDenied.body")}</p>
        </Section>
      </SiteLayout>
    );
  }

  return (
    <SettingsForm
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    />
  );
}

function SettingsForm({
  employerId,
  employerSlug,
  employerName,
  role,
  status,
  hasMultipleWorkspaces,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const getFn = useServerFn(getEmployerOrganisation);
  const updateFn = useServerFn(updateEmployerOrganisation);

  const canEdit = role === "owner" || role === "admin";

  const query = useQuery({
    queryKey: ["employer", employerId, "settings"],
    queryFn: () => getFn({ data: { employerId } }),
  });

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [descriptionSv, setDescriptionSv] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setName(query.data.name ?? "");
    setWebsite(query.data.website ?? "");
    setCountry(query.data.country ?? "");
    setRegistrationNumber(query.data.registrationNumber ?? "");
    setDescriptionSv(query.data.descriptionSv ?? "");
    setDescriptionEn(query.data.descriptionEn ?? "");
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          employerId,
          name,
          website: website || null,
          country: country || null,
          registrationNumber: registrationNumber || null,
          descriptionSv: descriptionSv || null,
          descriptionEn: descriptionEn || null,
        },
      }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["employer", employerId, "settings"] });
      void qc.invalidateQueries({ queryKey: ["employer", "my-workspaces"] });
    },
  });

  return (
    <SiteLayout>
      <EmployerWorkspaceChrome
        employerSlug={employerSlug}
        employerName={employerName}
        role={role}
        status={status}
        activeSection="settings"
        hasMultipleWorkspaces={hasMultipleWorkspaces}
      >
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("employer.settings.heading")}
        </h1>
        {!canEdit && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("employer.settings.viewOnlyNotice")}
          </p>
        )}

        {query.isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : query.isError ? (
          <p className="mt-6 text-sm text-destructive">{t("employer.settings.loadError")}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(false);
              mutation.mutate();
            }}
            className="mt-6 max-w-xl space-y-4"
          >
            <label className="block text-sm">
              <span className="text-foreground">{t("employer.settings.field.name")}</span>
              <input
                type="text"
                value={name}
                disabled={!canEdit}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>
            <label className="block text-sm">
              <span className="text-foreground">{t("employer.settings.field.website")}</span>
              <input
                type="text"
                value={website}
                disabled={!canEdit}
                onChange={(e) => setWebsite(e.target.value)}
                maxLength={300}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>
            <label className="block text-sm">
              <span className="text-foreground">{t("employer.settings.field.country")}</span>
              <input
                type="text"
                value={country}
                disabled={!canEdit}
                onChange={(e) => setCountry(e.target.value)}
                maxLength={100}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>
            <label className="block text-sm">
              <span className="text-foreground">
                {t("employer.settings.field.registrationNumber")}
              </span>
              <input
                type="text"
                value={registrationNumber}
                disabled={!canEdit}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                maxLength={100}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>
            <label className="block text-sm">
              <span className="text-foreground">{t("employer.settings.field.descriptionSv")}</span>
              <textarea
                value={descriptionSv}
                disabled={!canEdit}
                onChange={(e) => setDescriptionSv(e.target.value)}
                maxLength={2000}
                rows={3}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>
            <label className="block text-sm">
              <span className="text-foreground">{t("employer.settings.field.descriptionEn")}</span>
              <textarea
                value={descriptionEn}
                disabled={!canEdit}
                onChange={(e) => setDescriptionEn(e.target.value)}
                maxLength={2000}
                rows={3}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </label>

            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t("employer.settings.saveError")}
              </p>
            )}
            {saved && !mutation.isPending && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("employer.settings.saved")}
              </p>
            )}

            {canEdit && (
              <PrimaryButton type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? t("employer.settings.saving") : t("employer.settings.save")}
              </PrimaryButton>
            )}
          </form>
        )}
      </EmployerWorkspaceChrome>
    </SiteLayout>
  );
}
