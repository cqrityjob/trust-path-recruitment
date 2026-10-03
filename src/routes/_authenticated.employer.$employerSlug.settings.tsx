// Phase H3.2 — /employer/$employerSlug/settings: organisation profile
// view/edit. New in this phase, backed by a new additive migration
// (supabase/migrations/20260720064743_h3_2_employer_settings.sql) that
// adds the employers_owner_admin_update RLS policy and the
// employers_validate_before_write trigger guard (status/slug immutable
// for non-admins). Owner/admin can edit; a plain member sees a read-only
// view. Status is always displayed, never editable here.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import {
  getEmployerOrganisation,
  updateEmployerOrganisation,
} from "@/lib/job-intelligence/employer-settings.functions";
import { EmployerTeamPanel } from "@/components/employer/EmployerTeamPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EMPLOYER_IDENTITY_REREVIEW_KEY,
  identityChanges,
  type EmployerIdentityRereview,
  type IdentityChange,
  type IdentityField,
} from "@/lib/job-intelligence/identity-rereview";

const IDENTITY_FIELD_LABEL: Record<IdentityField, TranslationKey> = {
  name: "employer.settings.field.name",
  country: "employer.settings.field.country",
  registrationNumber: "employer.settings.field.registrationNumber",
  website: "employer.settings.field.website",
};

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
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }

  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  if (workspacesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (workspacesQuery.isError || !workspace) {
    return <EmployerAccessDenied workspaces={workspacesQuery.data} />;
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
  const { t, lang } = useT();
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
  // The identity fields about to change, while the owner is being asked.
  const [confirmChanges, setConfirmChanges] = useState<IdentityChange[] | null>(null);

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
    onSuccess: (result) => {
      setSaved(true);
      // The database -- not the comparison made before the save -- says whether
      // this save sent an approved organisation back to review. Recorded BEFORE
      // the workspace list is refetched: that refetch is what makes the
      // workspace gate redirect to /employer/pending, and the page it lands on
      // reads this to say "reviewed again" instead of thanking the owner for
      // registering.
      if (status === "active" && result.status === "pending") {
        qc.setQueryData<EmployerIdentityRereview>(EMPLOYER_IDENTITY_REREVIEW_KEY, { employerId });
      }
      void qc.invalidateQueries({ queryKey: ["employer", employerId, "settings"] });
      void qc.invalidateQueries({ queryKey: ["employer", "my-workspaces"] });
    },
  });

  // The warning the owner did not get: changing any of these four fields takes an
  // approved organisation back to review, which closes the workspace for the whole
  // team and takes live ads offline (employers_validate_before_write, 20270123090000).
  // Only an ACTIVE organisation is affected -- one that is already under review
  // has nothing further to lose -- and only a change that survives the trigger's
  // own trimmed, case-insensitive comparison counts.
  function submit() {
    setSaved(false);
    const changes =
      status === "active" && query.data
        ? identityChanges(
            {
              name: query.data.name,
              country: query.data.country,
              registrationNumber: query.data.registrationNumber,
              website: query.data.website,
            },
            { name, country, registrationNumber, website },
          )
        : [];
    if (changes.length > 0) {
      setConfirmChanges(changes);
      return;
    }
    mutation.mutate();
  }

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="organisation"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
        {t("employer.settings.heading")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("employer.settings.lede")}</p>
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
            submit();
          }}
          className="mt-6 max-w-xl space-y-4"
        >
          <h2 className="text-xl font-semibold text-foreground">
            {t("employer.settings.section.company")}
          </h2>
          {!descriptionSv.trim() && !descriptionEn.trim() && (
            <p className="rounded-lg bg-secondary p-3 text-sm leading-relaxed text-muted-foreground">
              {lang === "sv"
                ? "Lägg till en kort företagspresentation. Den visas tillsammans med era jobbannonser och hjälper kandidaten att förstå vilka ni är."
                : "Add a short company introduction. It appears with your job advertisements and helps candidates understand your organisation."}
            </p>
          )}
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

      {/* Team and review authorisation. It lives here rather than in a new
          navigation entry because the employer navigation is locked, and
          "who belongs to this account" is an organisation question. */}
      <EmployerTeamPanel employerId={employerId} canManage={canEdit} />

      <Dialog open={confirmChanges !== null} onOpenChange={(o) => !o && setConfirmChanges(null)}>
        <DialogContent data-testid="identity-rereview-confirm">
          <DialogHeader>
            <DialogTitle>{t("employer.settings.identityConfirm.title")}</DialogTitle>
            <DialogDescription>{t("employer.settings.identityConfirm.body")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-foreground">
            {t("employer.settings.identityConfirm.consequence")}
          </p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("employer.settings.identityConfirm.changes")}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-foreground">
              {(confirmChanges ?? []).map((c) => (
                <li key={c.field}>
                  <span className="font-medium">{t(IDENTITY_FIELD_LABEL[c.field])}:</span>{" "}
                  <span className="text-muted-foreground">
                    {c.from || t("employer.settings.identityConfirm.empty")}
                  </span>{" "}
                  → <span>{c.to || t("employer.settings.identityConfirm.empty")}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("employer.settings.identityConfirm.noReview")}
          </p>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("employer.settings.identityConfirm.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setConfirmChanges(null);
                mutation.mutate();
              }}
            >
              {t("employer.settings.identityConfirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EmployerAppShell>
  );
}
