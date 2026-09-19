// Metodstöd för rekrytering — the sibling section on Testbibliotek.
//
// ── WHY A SIBLING AND NOT A LIBRARY ROW ─────────────────────────────────
//
// The assessment read model above this section assumes test semantics: an
// instrument, item counts, a result a candidate "got". BESKT has none of
// those. Rendering it as one more library row would tell an employer it is a
// test, which is exactly the claim the PR 1 contract forbids — so it is a
// visually distinct section with its own heading, its own explanation and its
// own vocabulary, and it never borrows the assessment card.
//
// ── THE HONEST EMPTY STATE IS THE PRODUCT STATE ─────────────────────────
//
// Until a governed method has passed five human review gates AND the owner has
// admitted this employer to the pilot, `bcp_assignable_method_versions`
// returns nothing — in production, for every employer. That is not a bug and
// it is not hidden: the section says the method is under development and why.
// Seeding fake content so the screen looks complete is the specific failure
// this section is written to avoid.
//
// Every state is truthful and distinct: loading, error, permission denied,
// empty/under development, and available. "Available" is computed by the same
// database function the start path calls, so the screen and the button cannot
// disagree.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ClipboardList, Info, Loader2, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { listAssignableBesktMethods } from "@/lib/beskt/candidate-preparation.functions";
import { listBesktTestActivations } from "@/lib/beskt/internal-test.functions";
import { getMyBesktStanding } from "@/lib/beskt/complete.functions";
import { BesktStartDialog } from "@/components/beskt/BesktStartDialog";
import { BesktPreviewDialog } from "@/components/beskt/BesktPreviewDialog";
import {
  BesktAssignmentsList,
  BesktSecurityFunctionPanel,
  purposeKey,
} from "@/components/beskt/BesktModulePanels";

function isDenied(error: unknown): boolean {
  const m = error instanceof Error ? error.message : String(error ?? "");
  return /BCP_NOT_|permission denied|insufficient_privilege|not authorised/i.test(m);
}

export function MethodSupportSection({
  employerId,
  employerSlug,
  canManage = false,
}: {
  readonly employerId: string;
  /** When given, an available method offers its real next step. */
  readonly employerSlug?: string;
  /** The employer's owner or admin: may appoint the security function. */
  readonly canManage?: boolean;
}) {
  const { t, lang } = useT();
  const listMethods = useServerFn(listAssignableBesktMethods);

  const activationsFn = useServerFn(listBesktTestActivations);
  const standingFn = useServerFn(getMyBesktStanding);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  // Which offered versions this employer uses under the owner's recorded
  // activation rather than a completed review -- said on the row, plainly.
  const activations = useQuery({
    queryKey: ["beskt", "test-activations", employerId],
    queryFn: () => activationsFn({ data: { employerId } }),
    retry: false,
  });
  const underActivation = new Set(
    (activations.data ?? []).filter((a) => a.isLive).map((a) => a.methodVersionId),
  );
  const standing = useQuery({
    queryKey: ["beskt", "standing", employerId],
    queryFn: () => standingFn({ data: { employerId } }),
    retry: false,
  });

  const methods = useQuery({
    queryKey: ["beskt", "assignable-methods", employerId],
    queryFn: () => listMethods({ data: { employerId } }),
    retry: false,
  });

  return (
    <section
      aria-labelledby="beskt-method-support-heading"
      className="mt-12 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-5 sm:p-6"
      data-testid="beskt-method-support"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-foreground ring-1 ring-border"
        >
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="beskt-method-support-heading" className="text-lg font-semibold tracking-tight">
            <Badge className="mr-2 align-middle" data-testid="beskt-method-support-badge">
              {t("beskt.library.badge")}
            </Badge>
            {t("beskt.library.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("beskt.library.siblingNote")}</p>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t("beskt.library.lede")}
      </p>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("beskt.library.title")}>
        <li>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            {t("beskt.library.notAssessment")}
          </Badge>
        </li>
        <li>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            {t("beskt.library.humanDecides")}
          </Badge>
        </li>
      </ul>

      <div className="mt-5" aria-live="polite">
        {methods.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.library.loading")}
          </p>
        ) : methods.isError ? (
          isDenied(methods.error) ? (
            <Alert>
              <Info aria-hidden="true" className="h-4 w-4" />
              <AlertDescription>{t("beskt.library.denied")}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              <AlertTitle>{t("beskt.library.error")}</AlertTitle>
              <AlertDescription>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 min-h-[44px]"
                  onClick={() => void methods.refetch()}
                >
                  {t("beskt.library.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          )
        ) : methods.data.length === 0 ? (
          <div
            className="rounded-lg border bg-background p-4"
            data-testid="beskt-method-support-empty"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{t("beskt.library.underDevelopment")}</Badge>
              <h3 className="text-sm font-medium">{t("beskt.library.emptyTitle")}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("beskt.library.emptyBody")}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-background p-4" data-testid="beskt-module">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold" data-testid="beskt-module-name">
                  BESKT
                </h3>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {t("beskt.module.description")}
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-2" data-testid="beskt-method-support-list">
              {methods.data.map((m) => (
                <li
                  key={m.methodVersionId}
                  className="rounded-md border p-3"
                  data-testid="beskt-method-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t(purposeKey(m.mode))}</span>
                    <span className="text-sm text-muted-foreground" data-testid="beskt-method-name">
                      {(lang === "sv" ? m.nameSv : (m.nameEn ?? m.nameSv)) ?? m.packSlug}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      {t(
                        m.validationLabel === "content_validated"
                          ? "beskt.library.validationLabel.content_validated"
                          : "beskt.library.validationLabel.pilot_hypothesis",
                      )}
                    </Badge>
                  </div>
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    data-testid="beskt-method-status"
                  >
                    {underActivation.has(m.methodVersionId)
                      ? t("beskt.module.statusActivated").replace(
                          "{date}",
                          new Date(m.grantExpiresOn).toLocaleDateString(
                            lang === "sv" ? "sv-SE" : "en-GB",
                          ),
                        )
                      : t("beskt.module.statusPilot")}
                  </p>
                  <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex gap-1.5">
                      <dt>{t("beskt.library.version")}</dt>
                      <dd className="font-medium text-foreground">{m.versionNumber}</dd>
                    </div>
                    <div className="flex min-w-0 gap-1.5">
                      <dt>{t("beskt.library.contentHash")}</dt>
                      <dd className="truncate font-mono text-foreground">
                        {m.contentHash.slice(0, 12)}…
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setPreviewOpen(true)}
                data-testid="beskt-module-preview"
              >
                {t("beskt.module.preview")}
              </Button>
              {employerSlug ? (
                <Button
                  type="button"
                  className="min-h-[44px]"
                  onClick={() => setStartOpen(true)}
                  data-testid="beskt-module-start"
                >
                  {t("beskt.module.start")}
                </Button>
              ) : null}
            </div>
            {employerSlug ? (
              <BesktAssignmentsList employerId={employerId} employerSlug={employerSlug} />
            ) : null}
            <BesktSecurityFunctionPanel employerId={employerId} canManage={canManage} />
          </div>
        )}
      </div>
      {previewOpen && methods.data ? (
        <BesktPreviewDialog
          open
          onOpenChange={setPreviewOpen}
          employerId={employerId}
          methods={methods.data}
        />
      ) : null}
      {startOpen && employerSlug && methods.data ? (
        <BesktStartDialog
          open
          onOpenChange={setStartOpen}
          employerId={employerId}
          employerSlug={employerSlug}
          methods={methods.data}
          isSecurityOfficer={Boolean(standing.data?.isSecurityOfficer)}
        />
      ) : null}
    </section>
  );
}
