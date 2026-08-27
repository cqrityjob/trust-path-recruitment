// Interview Intelligence — create a new governed Role Interview Pack.
//
// Creating the pack and creating its first version are one action for the
// author and two governed operations underneath, in that order, because a pack
// carries identity and a version carries content. The form therefore pins a
// role VERSION, not a bare role: a package that followed "the current role"
// would silently change meaning the next time somebody edited the role.
//
// Every field error is linked to its field and repeated in a form-level summary
// that focuses on submit, so a keyboard or screen-reader user is told what went
// wrong and can reach it.

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import {
  AsyncState,
  ErrorSummary,
  NoticePanel,
} from "@/components/admin/interview/PackGovernanceUi";
import {
  createRolePack,
  createRolePackVersion,
  listPackableRoles,
} from "@/lib/interview-intelligence/role-packs.functions";

export const Route = createFileRoute("/_authenticated/admin/interview-role-packs/new")({
  ssr: false,
  component: NewRolePackPage,
});

interface FieldError {
  readonly fieldId: string;
  readonly message: string;
}

function NewRolePackPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const summaryRef = useRef<HTMLDivElement>(null);

  const rolesFn = useServerFn(listPackableRoles);
  const createPackFn = useServerFn(createRolePack);
  const createVersionFn = useServerFn(createRolePackVersion);

  const rolesQuery = useQuery({
    queryKey: ["admin", "interview-role-packs", "roles"],
    queryFn: () => rolesFn(),
  });

  const [slug, setSlug] = useState("");
  const [nameSv, setNameSv] = useState("");
  const [purposeSv, setPurposeSv] = useState("");
  const [roleVersionId, setRoleVersionId] = useState("");
  const [locale, setLocale] = useState("sv-SE");
  const [sourceReference, setSourceReference] = useState("");
  const [sourceDocumentVersion, setSourceDocumentVersion] = useState("");
  const [errors, setErrors] = useState<readonly FieldError[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      const role = rolesQuery.data?.roles.find((r) => r.roleVersionId === roleVersionId);
      if (!role) throw new Error(t("ii.new.error.roleMissing"));
      const { packId } = await createPackFn({
        data: { slug, roleId: role.roleId, nameSv, purposeSv, nameEn: null },
      });
      const { versionId } = await createVersionFn({
        data: {
          packId,
          locale,
          roleVersionId,
          sourceReference,
          sourceDocumentVersion,
          summarySv: null,
        },
      });
      return { packId, versionId };
    },
    onSuccess: ({ packId, versionId }) => {
      void navigate({
        to: "/admin/interview-role-packs/$packId/versions/$versionId",
        params: { packId, versionId },
      });
    },
  });

  function validate(): readonly FieldError[] {
    const next: FieldError[] = [];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      next.push({ fieldId: "ii-slug", message: t("ii.new.error.slug") });
    }
    if (nameSv.trim() === "") {
      next.push({ fieldId: "ii-name", message: t("ii.new.error.name") });
    }
    if (purposeSv.trim() === "") {
      next.push({ fieldId: "ii-purpose", message: t("ii.new.error.purpose") });
    }
    if (roleVersionId === "") {
      next.push({ fieldId: "ii-role", message: t("ii.new.error.role") });
    }
    if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
      next.push({ fieldId: "ii-locale", message: t("ii.new.error.locale") });
    }
    if (sourceReference.trim() === "") {
      next.push({ fieldId: "ii-source", message: t("ii.new.error.source") });
    }
    if (sourceDocumentVersion.trim() === "") {
      next.push({ fieldId: "ii-source-version", message: t("ii.new.error.sourceVersion") });
    }
    return next;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (found.length > 0) {
      // Move focus to the summary so the failure is announced, not just drawn.
      window.requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    create.mutate();
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  function errorFor(fieldId: string): string | null {
    return errors.find((e) => e.fieldId === fieldId)?.message ?? null;
  }

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="interviewRolePacks">
        <nav aria-label={t("ii.a11y.breadcrumb")} className="text-sm">
          <Link
            to="/admin/interview-role-packs"
            className="text-accent underline-offset-2 hover:underline"
          >
            {t("ii.list.heading")}
          </Link>
        </nav>

        <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
          {t("ii.new.heading")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("ii.new.intro")}
        </p>

        <div className="mt-6 max-w-3xl">
          <NoticePanel tone="attention" title={t("ii.new.pilotTitle")}>
            <p>{t("ii.new.pilotBody")}</p>
          </NoticePanel>
        </div>

        {rolesQuery.isLoading && (
          <div className="mt-6">
            <AsyncState state="loading" />
          </div>
        )}
        {rolesQuery.isError && (
          <div className="mt-6 max-w-3xl">
            <AsyncState state="error" message={(rolesQuery.error as Error).message} />
          </div>
        )}

        {rolesQuery.isSuccess && (
          <form onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl space-y-5">
            <div ref={summaryRef} tabIndex={-1}>
              <ErrorSummary errors={errors} />
            </div>

            {create.isError && (
              <NoticePanel tone="governance" role="alert" title={t("ii.new.serverErrorTitle")}>
                <p>{(create.error as Error).message}</p>
              </NoticePanel>
            )}

            <fieldset className="space-y-5">
              <legend className="text-base font-semibold text-foreground">
                {t("ii.new.section.identity")}
              </legend>

              <div>
                <label htmlFor="ii-name" className="text-sm font-medium text-foreground">
                  {t("ii.new.field.name")}
                </label>
                <input
                  id="ii-name"
                  value={nameSv}
                  onChange={(e) => setNameSv(e.target.value)}
                  aria-invalid={errorFor("ii-name") !== null}
                  aria-describedby={errorFor("ii-name") ? "ii-name-error" : undefined}
                  className={fieldClass}
                />
                {errorFor("ii-name") && (
                  <p id="ii-name-error" className="mt-1 text-xs text-destructive">
                    {errorFor("ii-name")}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="ii-slug" className="text-sm font-medium text-foreground">
                  {t("ii.new.field.slug")}
                </label>
                <input
                  id="ii-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  aria-invalid={errorFor("ii-slug") !== null}
                  aria-describedby={
                    errorFor("ii-slug") ? "ii-slug-error ii-slug-hint" : "ii-slug-hint"
                  }
                  className={fieldClass}
                />
                <p id="ii-slug-hint" className="mt-1 text-xs text-muted-foreground">
                  {t("ii.new.hint.slug")}
                </p>
                {errorFor("ii-slug") && (
                  <p id="ii-slug-error" className="mt-1 text-xs text-destructive">
                    {errorFor("ii-slug")}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="ii-purpose" className="text-sm font-medium text-foreground">
                  {t("ii.new.field.purpose")}
                </label>
                <textarea
                  id="ii-purpose"
                  rows={3}
                  value={purposeSv}
                  onChange={(e) => setPurposeSv(e.target.value)}
                  aria-invalid={errorFor("ii-purpose") !== null}
                  aria-describedby={errorFor("ii-purpose") ? "ii-purpose-error" : undefined}
                  className={fieldClass}
                />
                {errorFor("ii-purpose") && (
                  <p id="ii-purpose-error" className="mt-1 text-xs text-destructive">
                    {errorFor("ii-purpose")}
                  </p>
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-5">
              <legend className="text-base font-semibold text-foreground">
                {t("ii.new.section.roleContext")}
              </legend>

              <div>
                <label htmlFor="ii-role" className="text-sm font-medium text-foreground">
                  {t("ii.new.field.roleVersion")}
                </label>
                <select
                  id="ii-role"
                  value={roleVersionId}
                  onChange={(e) => setRoleVersionId(e.target.value)}
                  aria-invalid={errorFor("ii-role") !== null}
                  aria-describedby={
                    errorFor("ii-role") ? "ii-role-error ii-role-hint" : "ii-role-hint"
                  }
                  className={fieldClass}
                >
                  <option value="">{t("ii.new.field.rolePlaceholder")}</option>
                  {rolesQuery.data.roles.map((r) => (
                    <option key={r.roleVersionId} value={r.roleVersionId}>
                      {r.nameSv} — v{r.versionNumber} ({r.slug})
                    </option>
                  ))}
                </select>
                <p id="ii-role-hint" className="mt-1 text-xs text-muted-foreground">
                  {t("ii.new.hint.roleVersion")}
                </p>
                {errorFor("ii-role") && (
                  <p id="ii-role-error" className="mt-1 text-xs text-destructive">
                    {errorFor("ii-role")}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="ii-locale" className="text-sm font-medium text-foreground">
                  {t("ii.new.field.locale")}
                </label>
                <input
                  id="ii-locale"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  aria-invalid={errorFor("ii-locale") !== null}
                  aria-describedby={errorFor("ii-locale") ? "ii-locale-error" : undefined}
                  className={fieldClass}
                />
                {errorFor("ii-locale") && (
                  <p id="ii-locale-error" className="mt-1 text-xs text-destructive">
                    {errorFor("ii-locale")}
                  </p>
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-5">
              <legend className="text-base font-semibold text-foreground">
                {t("ii.new.section.source")}
              </legend>
              <p className="text-sm text-muted-foreground">{t("ii.new.hint.source")}</p>

              <div>
                <label htmlFor="ii-source" className="text-sm font-medium text-foreground">
                  {t("ii.new.field.source")}
                </label>
                <input
                  id="ii-source"
                  value={sourceReference}
                  onChange={(e) => setSourceReference(e.target.value)}
                  aria-invalid={errorFor("ii-source") !== null}
                  aria-describedby={errorFor("ii-source") ? "ii-source-error" : undefined}
                  className={fieldClass}
                />
                {errorFor("ii-source") && (
                  <p id="ii-source-error" className="mt-1 text-xs text-destructive">
                    {errorFor("ii-source")}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="ii-source-version" className="text-sm font-medium text-foreground">
                  {t("ii.new.field.sourceVersion")}
                </label>
                <input
                  id="ii-source-version"
                  value={sourceDocumentVersion}
                  onChange={(e) => setSourceDocumentVersion(e.target.value)}
                  aria-invalid={errorFor("ii-source-version") !== null}
                  aria-describedby={
                    errorFor("ii-source-version") ? "ii-source-version-error" : undefined
                  }
                  className={fieldClass}
                />
                {errorFor("ii-source-version") && (
                  <p id="ii-source-version-error" className="mt-1 text-xs text-destructive">
                    {errorFor("ii-source-version")}
                  </p>
                )}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={create.isPending}
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {create.isPending ? t("ii.new.submitting") : t("ii.new.submit")}
              </button>
              <Link
                to="/admin/interview-role-packs"
                className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t("ii.new.cancel")}
              </Link>
            </div>
          </form>
        )}
      </AdminShellChrome>
    </SiteLayout>
  );
}
