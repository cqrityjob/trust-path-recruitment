// The CV list.
//
// -- IT IS A DESTINATION, NOT A GENERATOR -------------------------------
//
// Somebody who made a CV last month opens /my-career/cv expecting to find
// it. Before persistence this route was a wizard, so returning to it meant
// starting again -- which is the difference between a feature and a demo.
//
// -- RESTRAINED ON PURPOSE ---------------------------------------------
//
// Name, what kind it is, when it was last touched, and a way in. No
// folders, no tags, no search, no bulk actions, no preview thumbnails. A
// person keeps a handful of CVs; a document-management platform is a
// different product and nobody asked for one.
//
// Readiness is still checked here, so somebody with no employment history
// is told what is missing instead of being handed a button that leads to a
// refusal one screen later.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, FileText, Plus, Sparkles } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { L, Lf, type Lang } from "@/components/professional-identity/copy";
import { CV, CV_MISSING_FIELD } from "@/components/professional-identity/cv-copy";
import { useT } from "@/i18n/context";
import { listMyCvs } from "@/lib/professional-identity/cv/cv-store.functions";
import { prepareMyCv } from "@/lib/professional-identity/cv/cv.functions";

export const Route = createFileRoute("/_authenticated/my-career/cv/")({
  ssr: false,
  head: () => ({
    meta: [{ title: "CV — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CvListPage,
});

/** A date somebody reads, in their own language, without a time. "Updated
 *  30 augusti 2026" is what the list is for; a timestamp to the second is
 *  precision nobody asked for. */
function readableDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function CvListPage() {
  const { lang } = useT();
  const l = lang as Lang;

  const prepare = useServerFn(prepareMyCv);
  const preparation = useQuery({
    queryKey: ["cv", "prepare"],
    queryFn: () => prepare(),
    staleTime: 60_000,
  });

  const load = useServerFn(listMyCvs);
  const list = useQuery({
    queryKey: ["cv", "list"],
    queryFn: () => load(),
    staleTime: 15_000,
  });

  const readiness = preparation.data?.readiness;
  const cvs = list.data ?? [];

  return (
    <SiteLayout>
      <Container className="py-10 md:py-14">
        <Link
          to="/my-career"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {L(CV.back, l)}
        </Link>

        <h1
          className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {L(CV.title, l)}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {L(CV.lede, l)}
        </p>

        {(preparation.isPending || list.isPending) && (
          <p className="mt-8 text-sm text-muted-foreground">{L(CV.loading, l)}</p>
        )}
        {(preparation.isError || list.isError) && (
          <p role="alert" className="mt-8 text-sm text-destructive">
            {L(CV.loadFailed, l)}
          </p>
        )}

        {/* Not ready: say what is missing rather than offering a button
            that leads to a refusal. */}
        {readiness && readiness.state === "needs_information" && (
          <div className="mt-8 max-w-2xl rounded-xl border border-border bg-card p-6">
            <p className="text-sm font-medium text-foreground">{L(CV.notReadyTitle, l)}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {readiness.missingFields.map((field) => (
                <li key={field}>{L(CV_MISSING_FIELD[field], l)}</li>
              ))}
            </ul>
            <Link
              to="/my-career/profile"
              className="mt-5 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
            >
              {L(CV.completeProfile, l)}
            </Link>
          </div>
        )}

        {readiness?.state === "ready" && cvs.length === 0 && !list.isPending && (
          <div className="mt-8 max-w-2xl rounded-xl border border-border bg-card p-6 md:p-8">
            <FileText className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-base font-semibold text-foreground">
              {L(CV.listEmptyTitle, l)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {L(CV.listEmptyBody, l)}
            </p>
            <Link
              to="/my-career/cv/new"
              className="mt-6 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
            >
              {L(CV.createFirst, l)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        {readiness?.state === "ready" && cvs.length > 0 && (
          <>
            <ul className="mt-8 max-w-3xl divide-y divide-border rounded-xl border border-border bg-card">
              {cvs.map((cv) => (
                <li
                  key={cv.cvId}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 md:p-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{cv.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {L(
                          cv.purpose === "targeted" ? CV.purposeTargetedLabel : CV.purposeGeneralLabel,
                          l,
                        )}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{Lf(CV.updatedAt, l, readableDate(cv.updatedAt, l))}</span>
                      {cv.origin === "ai_assisted" && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            {L(CV.aiAssistedLabel, l)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <Link
                    to="/my-career/cv/$cvId"
                    params={{ cvId: cv.cvId }}
                    className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-border bg-background px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    {L(CV.open, l)}
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              to="/my-career/cv/new"
              className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {L(CV.createNew, l)}
            </Link>
          </>
        )}
      </Container>
    </SiteLayout>
  );
}
