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

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ClipboardList, Info, Loader2, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { listAssignableBesktMethods } from "@/lib/beskt/candidate-preparation.functions";

function isDenied(error: unknown): boolean {
  const m = error instanceof Error ? error.message : String(error ?? "");
  return /BCP_NOT_|permission denied|insufficient_privilege|not authorised/i.test(m);
}

export function MethodSupportSection({ employerId }: { readonly employerId: string }) {
  const { t, lang } = useT();
  const listMethods = useServerFn(listAssignableBesktMethods);

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
          <ul className="space-y-3" data-testid="beskt-method-support-list">
            {methods.data.map((m) => (
              <li
                key={m.methodVersionId}
                className="rounded-lg border bg-background p-4"
                data-testid="beskt-method-row"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">
                      {(lang === "sv" ? m.nameSv : (m.nameEn ?? m.nameSv)) ?? m.packSlug}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(lang === "sv" ? m.summarySv : (m.summaryEn ?? m.summarySv)) ??
                        m.purposeSv ??
                        ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {t(
                      m.validationLabel === "content_validated"
                        ? "beskt.library.validationLabel.content_validated"
                        : "beskt.library.validationLabel.pilot_hypothesis",
                    )}
                  </Badge>
                </div>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
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
                {/* Deliberately NOT a start button. A preparation is always
                    started from a real application, so the control lives on
                    the application's own page and cannot be reached without
                    a candidate. */}
                <p className="mt-3 text-xs text-muted-foreground">{t("beskt.library.startHint")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
