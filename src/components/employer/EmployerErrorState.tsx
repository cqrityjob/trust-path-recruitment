// Phase H3.2.1 — shared error boundary for every /employer/$employerSlug/*
// route. Reused via each route's `errorComponent` so an unhandled failure
// (e.g. a server function throwing) never surfaces the framework's raw
// error UI or any internal detail (stack trace, missing-env-var name,
// Supabase/Postgres error text) to the employer. Mirrors the shape of the
// root-level ErrorComponent (src/routes/__root.tsx) but with employer-scoped,
// bilingual copy and an employer-appropriate recovery path.
//
// error.message is intentionally never rendered -- only logged
// server/browser-console-side via console.error, which never includes
// tokens, secret values or candidate data (the errors this route tree can
// throw are membership/auth/query failures, not payload dumps).

import { useEffect } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useT } from "@/i18n/context";

export function EmployerErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("[employer workspace]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {t("employer.error.heading")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("employer.error.body")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("employer.error.retry")}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/employer/login" })}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t("employer.error.signInAgain")}
        </button>
      </div>
    </div>
  );
}
