import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { readReturn, type ReturnContext } from "@/lib/career-center/return-context";

// The visible way back from a profession page.
//
// Server-rendered as the plain breadcrumb "Karriärcenter / {yrke}", which is
// true for every reader. After hydration, when this tab recorded where the
// reader came from for THIS page, the first crumb becomes a named way back
// to exactly that view — "Tillbaka till yrkeskatalogen", filters and section
// included. See return-context.ts.

const LABEL: Record<ReturnContext["origin"], TranslationKey> = {
  catalogue: "cc.back.catalogue",
  recommendation: "cc.back.recommendation",
  current_role: "cc.back.currentRole",
  routes: "cc.back.routes",
  report: "cc.back.report",
  my_career: "cc.back.myCareer",
  profession: "cc.back.profession",
};

export function ProfessionBackLink({
  targetPath,
  currentTitle,
}: {
  /** This page's path, which the stored context must have been written for. */
  targetPath: string;
  currentTitle: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [ctx, setCtx] = useState<ReturnContext | null>(null);
  useEffect(() => {
    setCtx(readReturn(targetPath));
  }, [targetPath]);

  return (
    <nav aria-label={t("cc.back.nav")} className="border-b border-border bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-6 py-2 text-sm text-muted-foreground md:px-8">
        {ctx ? (
          <a
            href={ctx.href}
            // Client-side, so the hub keeps its state; the href is still a
            // real URL for a new tab or a reader without script.
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              router.history.push(ctx.href);
            }}
            data-profession-back={ctx.origin}
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t(LABEL[ctx.origin])}
          </a>
        ) : (
          <Link
            to="/career-center"
            data-profession-back="hub"
            className="inline-flex min-h-11 items-center gap-1.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {/* The product's short NAME, not the hub's headline. */}
            {t("cc.hero.name")}
          </Link>
        )}
        <span aria-hidden>/</span>
        <span className="text-foreground" aria-current="page">
          {currentTitle}
        </span>
      </div>
    </nav>
  );
}
