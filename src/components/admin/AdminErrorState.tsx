// Phase H3.3 — shared error boundary for every /admin/* route, mirroring
// EmployerErrorState.tsx exactly. error.message is intentionally never
// rendered -- only logged via console.error, which never includes
// tokens, secret values, or candidate/employer personal data (the
// errors this route tree can throw are membership/auth/query failures,
// not payload dumps).

import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";

export function AdminErrorState({ error, reset }: ErrorComponentProps) {
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
        <Button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          {t("employer.error.retry")}
        </Button>
        <Button type="button" onClick={() => navigate({ to: "/admin/login" })} variant="outline">
          {t("employer.error.signInAgain")}
        </Button>
      </div>
    </div>
  );
}
