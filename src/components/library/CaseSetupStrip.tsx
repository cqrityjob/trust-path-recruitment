// The setup a case was started with -- method, role and work environment --
// shown under the case's stepper so every step can see it without anyone
// entering it again. A case started outside the library says so plainly; a
// failed read says that too, never "nothing chosen".

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { getCaseSetup } from "@/lib/library/setup.functions";

const ROLE: Record<string, TranslationKey> = {
  vaktare: "lib.role.vaktare",
  security_manager: "lib.role.security_manager",
};
const ENV: Record<string, TranslationKey> = {
  general: "lib.env.general",
  data_centre: "lib.env.data_centre",
  hospital: "lib.env.hospital",
  shopping_centre: "lib.env.shopping_centre",
};

export function CaseSetupStrip({
  caseId,
  setupFailed,
}: {
  readonly caseId: string;
  readonly setupFailed?: boolean;
}) {
  const { t } = useT();
  const fn = useServerFn(getCaseSetup);
  const q = useQuery({
    queryKey: ["ii", "setup", caseId],
    queryFn: () => fn({ data: { caseId } }),
    retry: false,
  });
  if (q.isPending) return null;
  return (
    <div className="mt-3 space-y-2" data-testid="case-setup">
      {setupFailed ? (
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          data-testid="case-setup-failed"
        >
          {t("lib.setupRecordFailed")}
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("lib.case.setup")}:</span>
        {q.isError ? (
          <span>{t("lib.blocker.content_unreadable")}</span>
        ) : q.data ? (
          <span data-testid="case-setup-value">
            {q.data.method === "trust" ? "TRUST" : "BESKT"} · {t(ROLE[q.data.roleProfile]!)} ·{" "}
            {t(ENV[q.data.environment]!)}
          </span>
        ) : (
          <span>{t("lib.case.setupNone")}</span>
        )}
      </p>
    </div>
  );
}
