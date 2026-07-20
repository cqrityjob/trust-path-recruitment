// Phase H3.3 — shared error boundary for every /admin/* route, mirroring
// EmployerErrorState.tsx exactly. error.message is intentionally never
// rendered -- only logged via console.error, which never includes
// tokens, secret values, or candidate/employer personal data (the
// errors this route tree can throw are membership/auth/query failures,
// not payload dumps).

import { useEffect } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useT } from "@/i18n/context";

export function AdminErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {t("employer.error.heading")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("admin.error.body")}</p>
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
          onClick={() => navigate({ to: "/admin/login" })}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t("employer.error.signInAgain")}
        </button>
      </div>
    </div>
  );
}
