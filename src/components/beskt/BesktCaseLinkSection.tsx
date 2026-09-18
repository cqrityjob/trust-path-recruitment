// From a submitted preparation to the interview — the link to Intervjuer.
//
// A submitted preparation reaches the interviewer only through a governed
// link to ONE interview case of the same employer, application and
// candidate. Without this section nothing in the product created that link,
// so the BESKT module never appeared on a real case.
//
// The cases offered are exactly the ones `bcp_linkable_interview_cases`
// returns, which is the set `bcp_link_preparation_to_case` accepts. When
// there is none, the section says so and points at the one place a case is
// created, prefilled with this application — it never creates a case itself.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  linkBesktPreparationToCase,
  listLinkableBesktCases,
} from "@/lib/beskt/candidate-preparation.functions";

export function BesktCaseLinkSection({
  assignmentId,
  applicationId,
  employerSlug,
}: {
  readonly assignmentId: string;
  readonly applicationId: string;
  readonly employerSlug: string;
}) {
  const { t, lang } = useT();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listLinkableBesktCases);
  const linkFn = useServerFn(linkBesktPreparationToCase);

  // Held across retries: the database answers a replayed operation id with
  // the first attempt's result, so a retry after a dropped response cannot
  // link twice — but only if it carries the same id.
  const [operationId, setOperationId] = useState<string | null>(null);

  const key = ["beskt", "linkable-cases", assignmentId] as const;
  const cases = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { assignmentId } }),
    retry: false,
  });

  const link = useMutation({
    mutationFn: (input: { caseId: string; expectedRevision: number }) => {
      const id = operationId ?? crypto.randomUUID();
      if (operationId === null) setOperationId(id);
      return linkFn({ data: { operationId: id, assignmentId, ...input } });
    },
    onSuccess: async () => {
      setOperationId(null);
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const linked = cases.data?.cases.filter((c) => c.alreadyLinked) ?? [];
  const linkable = cases.data?.cases.filter((c) => !c.alreadyLinked) ?? [];

  return (
    <section
      className="mt-6 border-t pt-5"
      aria-labelledby="beskt-case-link-heading"
      data-testid="beskt-case-link"
    >
      <h3 id="beskt-case-link-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Link2 aria-hidden="true" className="h-4 w-4" />
        {t("beskt.caseLink.heading")}
      </h3>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        {t("beskt.caseLink.lede")}
      </p>

      <div className="mt-3" aria-live="polite">
        {cases.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.caseLink.loading")}
          </p>
        ) : cases.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t(besktErrorKey(cases.error))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 min-h-[44px]"
                onClick={() => void cases.refetch()}
              >
                {t("beskt.library.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {linked.length > 0 ? (
              <ul className="space-y-2" data-testid="beskt-case-link-linked">
                {linked.map((c) => (
                  <li key={c.caseId} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t("beskt.caseLink.linked")}</Badge>
                      <span className="min-w-0 break-words text-sm font-medium">
                        {c.title ?? t("beskt.caseLink.untitled")}
                      </span>
                    </div>
                    <Button asChild size="sm" className="mt-3 min-h-[44px]">
                      <Link
                        to="/employer/$employerSlug/interview-intelligence/$caseId/beskt"
                        params={{ employerSlug, caseId: c.caseId }}
                      >
                        {t("beskt.caseLink.open")}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {linked.length === 0 && linkable.length > 0 ? (
              <ul className="space-y-2" data-testid="beskt-case-link-candidates">
                {linkable.map((c) => (
                  <li key={c.caseId} className="rounded-lg border p-3">
                    <p className="break-words text-sm font-medium">
                      {c.title ?? t("beskt.caseLink.untitled")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("beskt.caseLink.created")}{" "}
                      {new Date(c.createdAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 min-h-[44px]"
                      disabled={link.isPending}
                      data-testid="beskt-case-link-submit"
                      onClick={() =>
                        link.mutate({
                          caseId: c.caseId,
                          expectedRevision: cases.data!.revision,
                        })
                      }
                    >
                      {link.isPending ? t("beskt.caseLink.linking") : t("beskt.caseLink.action")}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {linked.length === 0 && linkable.length === 0 ? (
              <div className="rounded-lg border p-3" data-testid="beskt-case-link-none">
                <p className="text-sm">{t("beskt.caseLink.none")}</p>
                <Button asChild size="sm" variant="outline" className="mt-3 min-h-[44px]">
                  <Link
                    to="/employer/$employerSlug/interview-intelligence/new"
                    params={{ employerSlug }}
                    search={{ applicationId, jobId: undefined, beskt: true }}
                  >
                    {t("beskt.caseLink.create")}
                  </Link>
                </Button>
              </div>
            ) : null}

            {link.isError ? (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription data-testid="beskt-case-link-error">
                  {t(besktErrorKey(link.error))}
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
