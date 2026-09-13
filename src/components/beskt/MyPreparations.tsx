// The candidate's BESKT preparations, in My Career.
//
// A list of things an employer has asked them to do, with a truthful state
// and a way in. It shows no score, no progress judgement and no ranking,
// because there is none to show — and a cancelled preparation is simply
// absent rather than displayed as something the candidate failed to finish.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  listMyBesktPreparations,
  type BesktLifecycleState,
} from "@/lib/beskt/candidate-preparation.functions";

const STATE_KEY: Record<BesktLifecycleState, TranslationKey> = {
  assigned: "beskt.mycareer.state.assigned",
  notice_acknowledged: "beskt.mycareer.state.notice_acknowledged",
  in_progress: "beskt.mycareer.state.in_progress",
  submitted: "beskt.mycareer.state.submitted",
  cancelled: "beskt.mycareer.state.cancelled",
};

export function MyPreparations() {
  const { t, lang } = useT();
  const listPreparations = useServerFn(listMyBesktPreparations);

  const preparations = useQuery({
    queryKey: ["beskt", "my-preparations"],
    queryFn: () => listPreparations(),
    retry: false,
  });

  return (
    <section
      className="mt-10"
      aria-labelledby="beskt-my-preparations"
      data-testid="beskt-my-preparations"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"
        >
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="beskt-my-preparations" className="text-lg font-semibold tracking-tight">
            {t("beskt.mycareer.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("beskt.mycareer.lede")}</p>
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        {preparations.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.prep.loading")}
          </p>
        ) : preparations.isError ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>{t("beskt.prep.error")}</AlertDescription>
          </Alert>
        ) : preparations.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("beskt.mycareer.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {preparations.data.map((p) => (
              <li
                key={p.assignmentId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                data-testid="beskt-my-preparation-row"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {(lang === "sv" ? p.jobTitleSv : (p.jobTitleEn ?? p.jobTitleSv)) ?? ""}
                    {p.employerName ? ` · ${p.employerName}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{t(STATE_KEY[p.lifecycleState])}</Badge>
                    {p.dueAt ? (
                      <span>
                        {t("beskt.mycareer.due")}{" "}
                        {new Date(p.dueAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button asChild size="sm" className="min-h-[44px]">
                  <Link
                    to="/my-career/preparation/$assignmentId"
                    params={{ assignmentId: p.assignmentId }}
                  >
                    {t(
                      p.lifecycleState === "submitted"
                        ? "beskt.submitted.readOnly"
                        : p.lifecycleState === "assigned"
                          ? "beskt.prep.open"
                          : "beskt.prep.continue",
                    )}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
